import Unit from './unit';
import * as objectHash from '../common/object_hash';
import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import {Input, Output} from './message';
import storage from '../storage/storage';
import * as mainChain from './main_chain';
import Author from './author';
import Authentifier from './authentifiers';

export default class Joint {
    // readonly ball: Base64;
    readonly timestamp: number;

    constructor(readonly unit: Unit) {
        // this.ball = objectHash.getBallHash(unit, null, null, null);
        this.timestamp = Math.round(Date.now() / 1000);
    }

    static parseFromJson(json: string): Joint {
        return null;
    }
}

export async function saveJoint(joint: Joint, objValidationState: any) {
    const unit = joint.unit;
    const isGenesis = false;


    async function saveUnit(unit: Unit) {
        const fields = [
            'unit', 'version', 'alt', 'witness_list_unit', 'last_ball_unit', 'headers_commission',
            'payload_commission', 'sequence', 'content_hash',
        ];
        const values = '?,?,?,?,?,?,?,?,?';
        const params = [unit.unit, unit.version, unit.alt, unit.witnessListUnit, unit.lastBallUnit, unit.headersCommission,
            unit.payloadCommission, objValidationState.sequence, unit.contentHash,
        ];

        await sqlstore.run(`INSERT INTO units (${fields}) VALUES (${values})`, params);

        if (isGenesis) {
            await sqlstore.run(`
            UPDATE units SET is_on_main_chain=1, main_chain_index=0, is_stable=1, level=0, witnessed_level=0
            WHERE unit=?`, [unit.unit]);
        } else {
            await sqlstore.run(`UPDATE units SET is_free=0 WHERE unit IN(?)`, [unit.parentUnits]);
            unit.parentUnits.forEach((parent) => {
                if (storage.unstableUnits[parent])
                    storage.unstableUnits[parent].isFree = 0;
            });
        }
    }

    async function saveBall(joint: Joint) {
        if (joint.ball) {
            await sqlstore.run(`INSERT INTO balls (ball, unit) VALUES (?,?)`, [joint.ball, unit.unit]);
            await sqlstore.run(`DELETE FROM hash_tree_balls WHERE ball=? AND unit=?`, [joint.ball, unit.unit]);
        }
    }

    async function saveParents(unit: Unit) {
        if (unit.parentUnits) {
            for (const parent of unit.parentUnits) {
                await sqlstore.run(`INSERT INTO parenthoods (child_unit, parent_unit) VALUES (?,?)`, [unit.unit, parent]);
            }
        }
    }

    async function saveWitnesses(unit: Unit) {
        for (const witness of unit.witnesses) {
            await sqlstore.run(`INSERT INTO unit_witnesses (unit, address) VALUES (?,?)`, [unit.unit, witness]);
        }
        await sqlstore.run('INSERT INTO witness_list_hashes (witness_list_unit, witness_list_hash) VALUES (?,?)',
            [unit.unit, objectHash.getObjHashB64(unit.witnesses)]);
    }

    async function saveAuthors(unit: Unit) {
        const authorAddresses = [];
        for (let i = 0; i < unit.authors.length; i++) {
            const author = unit.authors[i];
            authorAddresses.push(author.address);
            const definition = author.definition;
            let definition_chash = null;
            if (definition) {
                definition_chash = objectHash.getChash160(definition);
                await;
                sqlstore.run(
                    `INSERT INTO definitions (definition_chash, definition, has_references) VALUES (?,?,?)`,
                    [definition_chash, JSON.stringify(definition), 0],
                );
                // actually inserts only when the address is first used.
                // if we change keys and later send a unit signed by new keys, the address is not inserted.
                // Its definition_chash was updated before when we posted change-definition message.
                if (definition_chash === author.address) {
                    await;
                    sqlstore.run(`INSERT INTO addresses (address) VALUES(?)`, [author.address]);
                }
            } else if (unit.contentHash) {
                await;
                sqlstore.run(`INSERT INTO addresses (address) VALUES(?)', [author.address]`);
            }

            await;
            sqlstore.run(`INSERT INTO unit_authors (unit, address, definition_chash) VALUES(?,?,?)`,
                [unit.unit, author.address, definition_chash]);
            if (isGenesis)
                conn.addQuery(arrQueries, 'UPDATE unit_authors SET _mci=0 WHERE unit=?', [objUnit.unit]);
            if (!unit.contentHash) {
                for (const path in author.authentifiers) {
                    await;
                    sqlstore.run(`
                   'INSERT INTO authentifiers (unit, address, path, authentifier) VALUES(?,?,?,?)`,
                        [unit.unit, author.address, path, author.authentifiers[path]],
                    );
                }
            }


        }
    }

    async function saveMessages(unit: Unit) {
        if (!unit.contentHash) {
            for (let i = 0; i < unit.messages.length; i++) {
                const message = unit.messages[i];

                await;
                sqlstore.run(`
                INSERT INTO messages
                (unit, message_index, app, payload_hash, payload_location, payload, payload_uri, payload_uri_hash)
                VALUES(?,?,?,?,?,?,?,?)`,
                    [unit.unit, i, message.app, message.payloadHash, message.payloadLocation, null, null, null],
                );

                if (message.spendProofs) {
                    for (let j = 0; j < message.spendProofs.length; j++) {
                        const spendProof = message.spendProofs[j];
                        await;
                        sqlstore.run(`
                        INSERT INTO spend_proofs (unit, message_index, spend_proof_index, spend_proof, address) VALUES(?,?,?,?,?)`,
                            [unit.unit, i, j, spendProof.spend_proof, spendProof.address || authorAddresses[0]],
                        );
                    }
                }
            }
        }
    }

    async function saveHeaderCommission(unit: Unit) {
        if (unit.earnedHeadersCommissionRecipients) {
            for (const recipient of unit.earnedHeadersCommissionRecipients) {
                await;
                sqlstore.run(`
                INSERT INTO earned_headers_commission_recipients (unit, address, earned_headers_commission_share) VALUES(?,?,?)`,
                    [unit.unit, recipient.address, recipient.earned_headers_commission_share],
                );
            }
        }
    }

    async function determineInputAddressFromSrcOutput(asset, denomination, input: Input): Promise<Address> {
        const rows = await sqlstore.all(
            'SELECT address, denomination, asset FROM outputs WHERE unit=? AND message_index=? AND output_index=?',
            [input.unit, input.messageIndex, input.outputIndex],
        );

        if (rows.length > 1)
            throw new Error('multiple src outputs found');
        if (rows.length === 0) {
            throw new Error('src output not found');
        }

        const address = rows[0].address;
        if (authorAddresses.indexOf(address) === -1) {
            throw new Error('src output address not among authors');
        }

        return address;
    }

    async function addInlinePaymentQueries() {
        for (let i = 0; i < unit.messages.length; i++) {
            const message = unit.messages[i];
            const payload = message.payload;
            const denomination = 1;

            for (let j = 0; j < payload.inputs.length; j++) {
                const input = payload.inputs[j];
                const type = input.type || 'transfer';
                const srcUnit = (type === 'transfer') ? input.unit : null;
                const srcMessageIndex = (type === 'transfer') ? input.messageIndex : null;
                const srcOutputIndex = (type === 'transfer') ? input.outputIndex : null;
                const fromMCI =
                    (type === 'witnessing' || type === 'headers_commission') ? input.from_main_chain_index : null;
                const toMCI =
                    (type === 'witnessing' || type === 'headers_commission') ? input.to_main_chain_index : null;

                const determineInputAddress = function () {
                    if (type === 'headers_commission' || type === 'witnessing' || type === 'issue')
                        return authorAddresses.length === 1 ? authorAddresses[0] : input.address;
                    // hereafter, transfer
                    if (authorAddresses.length === 1)
                        return authorAddresses[0];
                    determineInputAddressFromSrcOutput(payload.asset, denomination, input);
                };

                const address = determineInputAddress();

                const isUnique =
                    objValidationState.arrDoubleSpendInputs.some((ds) => {
                        return (ds.message_index === i && ds.input_index === j);
                    }) ? null : 1;

                await sqlstore.run(`
                    INSERT INTO inputs 
                    (unit, message_index, input_index, type, 
                    src_unit, src_message_index, src_output_index, 
                    from_main_chain_index, to_main_chain_index, 
                    denomination, amount, serial_number, 
                    asset, is_unique, address) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [unit.unit, i, j, type, srcUnit, srcMessageIndex, srcOutputIndex,
                        fromMCI, toMCI, denomination, input.amount, input.serial_number,
                        payload.asset, isUnique, address,
                    ],
                );

                switch (type) {
                    case 'transfer':
                    case 'headers_commission':
                    case 'witnessing':
                }

                for (let j = 0; j < payload.outputs.length; j++) {
                    const output = payload.outputs[j];
                    // we set is_serial=1 for public payments
                    // as we check that their inputs are stable and serial before spending,
                    // therefore it is impossible to have a non serial in the middle of the chain (but possible for private payments)
                    sqlstore.run(`
                        INSERT INTO outputs
                        (unit, message_index, output_index, address, amount, asset, denomination, is_serial) VALUES(?,?,?,?,?,?,?,1)`,
                        [unit.unit, i, j, output.address, output.amount, payload.asset, denomination],
                    );
                }
            }
        }
    }

    let myBestParent;

    async function updateBestParent() {
        // choose best parent among compatible parents only
        const rows = await sqlstore.all(`
                SELECT unit
                FROM units AS parent_units
                WHERE unit IN(?)
                    AND (witness_list_unit=? OR (
                        SELECT COUNT(*)
                        FROM unit_witnesses
                        JOIN unit_witnesses AS parent_witnesses USING(address)
                        WHERE parent_witnesses.unit IN(parent_units.unit, parent_units.witness_list_unit)
                            AND unit_witnesses.unit IN(?, ?)
                    )>=?)
                ORDER BY witnessed_level DESC,
                    level-witnessed_level ASC,
                    unit ASC
                LIMIT 1`,
            [unit.parentUnits, unit.witnessListUnit,
                unit.unit, unit.witnessListUnit, conf.COUNT_WITNESSES - conf.MAX_WITNESS_LIST_MUTATIONS],
        );

        if (rows.length !== 1) {
            throw new Error('zero or more than one best parent unit?');
        }
        myBestParent = rows[0].unit;
        if (myBestParent !== objValidationState.best_parent_unit) {
            throw new Error('different best parents');
        }

        await sqlstore.run(`UPDATE units SET best_parent_unit=? WHERE unit=?`, [myBestParent, unit.unit]);
    }

    async function determineMaxLevel() {
        let maxLevel = 0;
        for (const parent of unit.parentUnits) {
            const props = await storage.readStaticUnitProps(parent);
            if (props.level > maxLevel)
                maxLevel = props.level;
        }

        return maxLevel;
    }

    async function updateLevel() {
        const rows = await sqlstore.all(`
            SELECT MAX(level) AS max_level FROM units WHERE unit IN(?)`, [unit.parentUnits]);

        if (rows.length !== 1)
            throw new Error('not a single max level?');
        const maxLevel = await determineMaxLevel();
        if (maxLevel !== rows[0].max_level) {
            throw new Error('different max level');
        }

        newUnitProps.level = maxLevel + 1;
        await sqlstore.run(`UPDATE units SET level=? WHERE unit=?`, [rows[0].max_levle + 1, unit.unit]);
    }

    async function updateWitnessedLevel() {
        if (unit.witnesses)
            return updateWitnessedLevelByWitnesslist(unit.witnesses);
        else
        // storage.readWitnessList(conn, objUnit.witness_list_unit, function (arrWitnesses) {
        //     updateWitnessedLevelByWitnesslist(arrWitnesses, cb);
        // });
            }

// The level at which we collect at least 7 distinct witnesses while walking up the main chain from our unit.
// The unit itself is not counted even if it is authored by a witness
    async function updateWitnessedLevelByWitnesslist(witnesses: Address[]) {
        const collectedWitnesses = [];

        async function setWitnessedLevel(witnessedLevel: number) {
            if (witnessedLevel !== objValidationState.witnessed_level)
                throw Error('different witnessed levels');
            newUnitProps.witnessed_level = witnessedLevel;
            await sqlstore.run('UPDATE units SET witnessed_level=? WHERE unit=?', [witnessedLevel, unit.unit]);
        }

        async function addWitnessesAndGoUp(startUnit: Base64) {
            const props = await storage.readStaticUnitProps(startUnit);
            const bestParentUnit = props.best_parent_unit;
            const level = props.level;
            if (level === null)
                throw Error('null level in updateWitnessedLevel');
            if (level === 0) // genesis
                return setWitnessedLevel(0);
            const authors = await storage.readUnitAuthors(startUnit);
            for (let i = 0; i < authors.length; i++) {
                const address = authors[i];
                if (witnesses.indexOf(address) !== -1 && collectedWitnesses.indexOf(address) === -1)
                    collectedWitnesses.push(address);
                (collectedWitnesses.length < conf.MAJORITY_OF_WITNESSES)
                    ? addWitnessesAndGoUp(bestParentUnit)
                    : setWitnessedLevel(level);
            }
        }

    }

    const newUnitProps = {
        unit: unit.unit,
        level: isGenesis ? 0 : null,
        latest_included_mc_index: null,
        main_chain_index: isGenesis ? 0 : null,
        is_on_main_chain: isGenesis ? 1 : 0,
        is_free: 1,
        is_stable: isGenesis ? 1 : 0,
        witnessed_level: isGenesis ? 0 : null,
        parent_units: unit.parentUnits,
    };

    await addInlinePaymentQueries();

    if (unit.parentUnits) {
        await updateBestParent();
        await updateLevel();
        await updateWitnessedLevel();
        await mainChain.updateMainChain(null, unit.unit);
    }
}

async function readUnit(unit: Base64): Promise<Unit> {
    const row = await sqlstore.get(`
        SELECT units.unit, version, alt, witness_list_unit, last_ball_unit, balls.ball AS last_ball, is_stable,
        content_hash, headers_commission, payload_commission, main_chain_index,
        FROM units LEFT JOIN balls ON last_ball_unit=balls.unit WHERE units.unit=?`,
        [unit],
    );

    const parents = await readParents(unit);
    const ball = await readBall(unit);
    const witnesses = await readWitnesses(unit);
    const authors = await readAuthors(unit);
    const messages = await readMessages(unit);
    return new Unit(
        row.version,
        row.alt,
        parents,
        ball,
        null,
        witnesses,
        authors,
        witnesses,
        messages,
    );
}

async function readParents(unit: Base64): Promise<Base64[]> {
    const rows = await sqlstore.all(`
        SELECT parent_unit
        FROM parenthoods
        WHERE child_unit=?
        ORDER BY parent_unit`,
        [unit],
    );

    return rows.map(row => row.parentUnits);
}

async function readBall(unit: Base64): Promise<Base64> {
    const row = await sqlstore.get('SELECT ball FROM balls WHERE unit=?', [unit]);
    return row.ball;
}

async function readWitnesses(unit: Base64): Promise<Address[]> {
    const rows = await sqlstore.all(
        'SELECT address FROM unit_witnesses WHERE unit=? ORDER BY address',
        [unit],
    );
    return rows.map(row => row.address);
}

async function readEarnedHeadersCommission(unit: Base64) { // earned_headers_commission_recipients
    const rows = await sqlstore.all(`
            SELECT address, earned_headers_commission_share 
            FROM earned_headers_commission_recipients
            WHERE unit=? ORDER BY address`,
        [unit],
    );
    return rows;
}

async function readAuthors(unit: Base64): Promise<Author[]> {
    const rows = await sqlstore.all(
        'SELECT address, definition_chash FROM unit_authors WHERE unit=? ORDER BY address',
        [unit],
    );

    return Promise.all(rows.map(async (row) => {
        const auths = await sqlstore.all(
            'SELECT path, authentifier FROM authentifiers WHERE unit=? AND address=?',
            [unit, row.address],
        );
        const authentifiers = auths.map(auth => {
            return new Authentifier(auth.path, auth.authentifier);
        });

        return new Author(row.address, authentifiers);
    }));
}

async function readInputs(unit: Base64, messageIndex: number): Promise<Input[]> {
    const rows = await sqlstore.all(`
            SELECT type, denomination, assets.fixed_denominations,
            src_unit AS unit, src_message_index AS message_index, src_output_index AS output_index,
            from_main_chain_index, to_main_chain_index, serial_number, amount, address, asset
            FROM inputs
            LEFT JOIN assets ON asset=assets.unit
            WHERE inputs.unit=? AND inputs.message_index=?
            ORDER BY input_index`,
        [unit, messageIndex],
    );

    const inputs = [];
    for (let i = 0; i < rows.length; i++) {
        const input = rows[i];
        inputs.push(new Input(input.unit, input.message_index, input.output_index, input.type));
    }

    return inputs;
}

async function readOutputs(unit: Base64, messageIndex: number): Promise<Output[]> {
    const rows = await sqlstore.all( // we don't select blinding because it's absent on public payments
        `SELECT address, amount, asset, denomination
            FROM outputs WHERE unit=? AND message_index=? ORDER BY output_index`,
        [unit, messageIndex],
    );

    const outputs = [];
    for (const output of outputs) {
        outputs.push(new Output(output.address, output.amount));
    }
    return outputs;
}

async function readSpendProofs(unit: Base64, messageIndex: number): Promise<any[]> {
    const rows = await sqlstore.all(`
            SELECT spend_proof, address FROM spend_proofs WHERE unit=? AND message_index=? ORDER BY spend_proof_index`,
        [unit, messageIndex],
    );

    return rows.map(row => {
        return row;
    });
}

async function readMessages(unit: Base64) {
    const rows = await sqlstore.all(
        'SELECT app, payload_hash, payload_location, payload, payload_uri, payload_uri_hash, message_index \n\
        FROM messages WHERE unit=? ORDER BY message_index',
        [unit],
    );

    const messages = [];
    for (const row of rows) {
        const inputs = await readInputs(row.unit, row.messageIndex);
        const outputs = await readOutputs(row.unit, row.messageIndex);
        const spendProofs = await readSpendProofs(row.unit, row.messageIndex);
        const message = row;
        message.payload = {
            inputs: inputs,
            outputs: outputs,
        };
        messages.push(message);
    }

    return messages;
}

enum UnitStatus {
    known,
    knownUnverified,
    knownBad,
    new,
}

export async function checkIfNewUnit(unit: Unit): Promise<UnitStatus> {
    const rows = await sqlstore.all('SELECT 1 FROM units WHERE unit=?', [unit]);
    if (rows.length > 0) {
        return UnitStatus.known;
    }
    return UnitStatus.new;
}

