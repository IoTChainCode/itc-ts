import Unit from './unit';
import {
    hasFieldsExcept, isNonnegativeInteger, isPositiveInteger, isStringOfLength,
    isValidAddressAnyCase,
} from '../common/validation_utils';
import {Message, Payload} from './message';
import * as conf from '../common/conf';
import sqlstore from '../storage/sqlstore';


async function validateParents(unit: Unit, lbMCI: number) {

    // avoid merging the obvious nonserials
    async function checkNoSameAddressInDifferentParents() {
        if (unit.parentUnits.length === 1)
            return checkLastBallDidNotRetreat();
        const rows = await sqlstore.all(`
            SELECT address, COUNT(*) AS c 
            FROM unit_authors WHERE unit IN(?) 
            GROUP BY address HAVING c>1`,
            unit.parentUnits,
        );
        if (rows.length > 0)
            throw Error('some addresses found more than once in parents, e.g. ' + rows[0].address);
        return checkLastBallDidNotRetreat();
    }

    async function checkLastBallDidNotRetreat() {
        const row = await sqlstore.get(`
            SELECT MAX(lb_units.main_chain_index) AS max_parent_last_ball_mci
            FROM units JOIN units AS lb_units ON units.last_ball_unit=lb_units.unit
            WHERE units.unit IN(?)`,
            unit.parentUnits,
        );

        const max_parent_last_ball_mci = row.max_parent_last_ball_mci;
        if (max_parent_last_ball_mci > lbMCI) {
            throw Error(`last ball mci must not retreat, parents: ${unit.parentUnits.join(', ')}`);
        }
    }

    if (unit.parentUnits.length > conf.MAX_PARENTS_PER_UNIT) // anti-spam
        throw Error('too many parents: ' + unit.parentUnits.length);
    // after this point, we can trust parent list as it either agrees with parents_hash or agrees with hash tree
    // hence, there are no more joint errors, except unordered parents or skiplist units
    const lastBall = unit.lastBall;
    const lastBallUnit = unit.lastBallUnit;
    let prev = '';
    const missingParentUnits = [];
    const prevParentUnitProps = [];
    // objValidationState.max_parent_limci = 0;
    const join = unit.ball ? 'LEFT JOIN balls USING(unit) LEFT JOIN hash_tree_balls ON units.unit=hash_tree_balls.unit' : '';
    const field = unit.ball ? ', IFNULL(balls.ball, hash_tree_balls.ball) AS ball' : '';

    for (const parent of unit.parentUnits) {
        if (parent <= prev) {
            throw Error('parent units not ordered');
        }
        prev = parent;

        const row = await sqlstore.get(`SELECT units.* ${field} FROM units ${join} WHERE units.unit=?`, parent);
        if (row === undefined) {
            missingParentUnits.push(parent);
        }
        if (unit.ball && row.ball === null) {
            throw Error('no ball corresponding to parent unit');
        }
    }

    if (missingParentUnits.length > 0) {
        const rows = await sqlstore.all('SELECT error FROM known_bad_joints WHERE unit IN(?)', missingParentUnits);
        if (rows.length > 0) {
            throw Error('some of the unit parents are known bad');
        } else {
            throw Error(`unresolved parent units: ${missingParentUnits.join(',')}`);
        }
    }

    const rows = await sqlstore.all(`
        SELECT is_stable, is_on_main_chain, main_chain_index, ball, 
        (SELECT MAX(main_chain_index) FROM units) AS max_known_mci
        FROM units LEFT JOIN balls USING(unit) WHERE unit=?`,
        lastBallUnit,
    );
    if (rows.length !== 1) {
        throw Error(`last ball unit ${lastBallUnit} not found`);
    }

    const objLastBallUnitProps = rows[0];

    // it can be unstable and have a received (not self-derived) ball
    //if (objLastBallUnitProps.ball !== null && objLastBallUnitProps.is_stable === 0)
    //    throw "last ball "+last_ball+" is unstable";
    if (objLastBallUnitProps.ball === null && objLastBallUnitProps.is_stable === 1)
        throw Error(`last ball unit ${lastBallUnit} is stable but has no ball`);
    if (objLastBallUnitProps.is_on_main_chain !== 1)
        throw Error(`last ball ${lastBall} is not on MC`);
    if (objLastBallUnitProps.ball && objLastBallUnitProps.ball !== lastBall)
        throw Error(`last_ball ${lastBall} and ${lastBallUnit} do not match`);
    if (objLastBallUnitProps.is_stable === 1) {
        // if it were not stable, we wouldn't have had the ball at all
        if (objLastBallUnitProps.ball !== lastBall)
            throw Error(`stable: lastBall ${lastBall} and lastBallUnit ${lastBallUnit} do not match`);
    }
}

async function validatePayment(message: Message, unit: Unit) {
    if (hasFieldsExcept(message.payload, ['inputs', 'outputs'])) {
        throw Error('unknown fields in payment message');
    }
    return validatePaymentInputsAndOutputs(message.payload, 0, unit);
}

async function validatePaymentInputsAndOutputs(payload: Payload, messageIndex: number, unit: Unit) {
    if (payload.inputs.length > conf.MAX_INPUTS_PER_PAYMENT_MESSAGE)
        throw Error('too many inputs');
    if (payload.outputs.length > conf.MAX_OUTPUTS_PER_PAYMENT_MESSAGE)
        throw Error('too many outputs');

    const denomination = 1;

    const authorAddresses = unit.authors.map(author => author.address);
    let inputAddresses = []; // used for non-transferrable assets only
    const outputAddresses = [];
    let totalInput = 0;
    let totalOutput = 0;
    let prevAddress = ''; // if public, outputs must be sorted by address
    let prevAmount = 0;
    for (let i = 0; i < payload.outputs.length; i++) {
        const output = payload.outputs[i];
        if (hasFieldsExcept(output, ['address', 'amount', 'blinding', 'output_hash']))
            throw Error('unknown fields in payment output');
        if (!isPositiveInteger(output.amount))
            throw Error('amount must be positive integer, found ' + output.amount);
        if (!isValidAddressAnyCase(output.address))
            throw Error('output address ' + output.address + ' invalid');

        if (prevAddress > output.address)
            throw Error('output addresses not sorted');
        else if (prevAddress === output.address && prevAmount > output.amount)
            throw Error('output amounts for same address not sorted');
        prevAddress = output.address;
        prevAmount = output.amount;
        if (output.address && outputAddresses.indexOf(output.address) === -1)
            outputAddresses.push(output.address);
        totalOutput += output.amount;
    }

    let isIssue = false;

    for (let inputIndex = 0; inputIndex < payload.inputs.length; inputIndex++) {
        const input = payload.inputs[inputIndex];
        const type = input.type || 'transfer';

        let doubleSpendWhere;
        let doubleSpendVars = [];

        switch (type) {
            // case 'issue':
            //     if (inputIndex !== 0)
            //         throw Error('issue must come first');
            //     if (hasFieldsExcept(input, ['type', 'address', 'amount', 'serial_number']))
            //         throw Error('unknown fields in issue input');
            //     if (!isPositiveInteger(input.amount))
            //         throw Error('amount must be positive');
            //     if (!isPositiveInteger(input.serial_number))
            //         throw Error('serial_number must be positive');
            //     if (input.serial_number !== 1)
            //         throw Error('for capped asset serial_number must be 1');
            //     if (isIssue)
            //         throw Error('only one issue per message allowd');
            //     isIssue = true;
            //
            //     let address = null;
            //     if (authorAddresses.length === 1) {
            //         if ('address' in input)
            //             throw Error('when single-authored, must not put address in issue input');
            //         address = authorAddresses[0];
            //     } else {
            //         if (typeof input.address !== 'string')
            //             throw Error('when multi-authored, must put address in issue input');
            //         if (authorAddresses.indexOf(input.address) === -1)
            //             throw Error('issue input address ' + input.address + ' is not an author');
            //         address = input.address;
            //     }
            //
            //     inputAddresses = [address];
            //     if (!genesis.isGenesisUnit(unit.unit))
            //         throw Error('only genesis can issue base asset');
            //     if (input.amount !== conf.TOTAL)
            //         throw Error('issue must be equal to cap');
            //     totalInput += input.amount;
            //
            //     break;

            case 'transfer':
                if (hasFieldsExcept(input, ['type', 'unit', 'message_index', 'output_index']))
                    throw Error('unknown fields in payment input');
                if (!isStringOfLength(input.unit, conf.HASH_LENGTH))
                    throw Error('wrong unit length in payment input');
                if (!isNonnegativeInteger(input.messageIndex))
                    throw Error('no message_index in payment input');
                if (!isNonnegativeInteger(input.outputIndex))
                    throw Error('no output_index in payment input');

                doubleSpendWhere = 'type=? AND src_unit=? AND src_message_index=? AND src_output_index=?';
                doubleSpendVars = [type, input.unit, input.messageIndex, input.outputIndex];

                const rows = await sqlstore.all(`
                    SELECT amount, is_stable, sequence, address, main_chain_index, denomination, asset
                    FROM outputs
                    JOIN units USING(unit)
                    WHERE outputs.unit=? AND message_index=? AND output_index=?`,
                    input.unit, input.messageIndex, input.outputIndex,
                );
                if (rows.length > 1)
                    throw Error('more than 1 src output');
                if (rows.length === 0)
                    throw Error('input unit ' + input.unit + ' not found');
                const srcOutput = rows[0];
                if (typeof srcOutput.amount !== 'number')
                    throw Error('src output amount is not a number');
                if (srcOutput.sequence !== 'good') // it is also stable or private
                    throw Error('input unit ' + input.unit + ' is not serial');
                const onwerAddress = srcOutput.address;
                if (authorAddresses.indexOf(onwerAddress) === -1)
                    throw Error('output owner is not among authors');
                if (denomination !== srcOutput.denomination)
                    throw Error('denomination mismatch');
                if (inputAddresses.indexOf(onwerAddress) === -1)
                    inputAddresses.push(onwerAddress);
                totalInput += srcOutput.amount;
        }

    }

    if (totalInput !== totalOutput + unit.headersCommission + unit.payloadCommission) {
        throw Error('inputs and outputs do not balance');
    }
}
