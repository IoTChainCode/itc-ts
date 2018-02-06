import * as _ from 'lodash';
import {Signer} from './signer';
import {Input, IssueInput, Message, Output, TransferInput} from './message';
import Unit from './unit';
import Author from './author';
import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import composeParent from './composeParent';
import Witnesses from '../models/Witnesses';
import Wallet from '../wallets/wallet';
import {Authentifiers} from './authentifiers';
import {MyWitnesses} from '../models/MyWitnesses';
import logger from '../common/log';
import {Inputs} from '../models/Messages';

function composeGenesisInputs(): Input[] {
    const issueInput: IssueInput = {
        type: 'issue',
        serialNumber: 1,
        amount: conf.TOTAL,
    };
    return [issueInput];
}

function composeGenesisOutputs(witnesses: Address[]): Output[] {
    const per = conf.TOTAL / conf.COUNT_WITNESSES;
    return witnesses.map(witness => new Output(witness, per));
}

export async function composeGenesisUnit(witnesses: Address[], wallet: Wallet): Promise<Unit> {
    const inputs = composeGenesisInputs();
    const outputs = composeGenesisOutputs(witnesses);
    const message = Message.newPaymentMessage(inputs, outputs);

    const address = await wallet.address();
    const authors = await composeAuthors([address], [wallet.key.deriveDeviceAddress()], wallet.signer);

    const unit = new Unit(
        [],
        null,
        null,
        null,
        authors,
        witnesses,
        [message],
    );

    for (const author of authors) {
        author.authentifiers['r'] = await wallet.signer.sign(unit, author.address, 'r');
    }

    unit.unit = unit.calcUnit();
    unit.ball = unit.calcBall();
    return unit;
}

export async function composeInputs(
    targetAmount: number,
    payingAddresses: Address[],
    lastBallMCI: number,
): Promise<[TransferInput[], number]> {
    return readUtxoForAmount(payingAddresses, lastBallMCI, targetAmount);
}

export function composeOutputs(outputs: Output[], changeAddress: Address, change: number): Output[] {
    const changeOutput = new Output(changeAddress, change);
    return [changeOutput].concat(outputs.filter(output => output.amount > 0));
}

export async function composeAuthors(addresses: Address[], deviceAddresses: DeviceAddress[], signer: Signer): Promise<Author[]> {
    return await Promise.all(addresses.map(async (address) => {
        const definition = await signer.readDefinitions(address);
        const signingPathLengths = await signer.readSigningPaths(address, deviceAddresses);

        const authentifiers: Authentifiers = {};
        for (const [path, length] of signingPathLengths) {
            authentifiers[path] = '-'.repeat(length);
        }
        return new Author(address, authentifiers, definition);
    }));
}

export async function composeWitnessListUnit(witnesses: Address[], lastBallMCI: number): Promise<Address> {
    return await Witnesses.findWitnessListUnit(witnesses, lastBallMCI);
}

export async function composeUnit(
    witnesses: Address[],
    signingAddresses: Address[],
    payingAddresses: Address[],
    changeAddress: Address,
    outputs: Output[],
    signer: Signer,
) {
    const fromAddresses = _.union(signingAddresses, payingAddresses).sort();

    const [parentUnits, lastStable] = await composeParent(witnesses);
    const witnessListUnit = await composeWitnessListUnit(witnesses, lastStable.mci);
    if (!witnessListUnit && !witnesses) {
        witnesses = await MyWitnesses.readWitnesses();
    }
    logger.info({witnesses}, 'witnesses');
    const authors = await composeAuthors(fromAddresses, [], signer);
    logger.info({authors}, 'composeAuthors');
    const externalOutputs: Output[] = outputs.filter(output => output.amount > 0);
    const outputAmount = externalOutputs.reduce((acc, cur) => acc + cur.amount, 0);
    const [inputs, inputAmount] = await composeInputs(outputAmount, payingAddresses, lastStable.mci);
    logger.info({inputs, inputAmount}, 'composeInputs');
    const headersCommission = 0;
    const payloadCommission = 0;
    const changeAmount = inputAmount - outputAmount - headersCommission - payloadCommission;
    const finalOutputs = composeOutputs(outputs, changeAddress, changeAmount);
    logger.info({finalOutputs}, 'composeOutputs');
    const message = new Message('payment', 'inline', inputs, finalOutputs);
    return new Unit(
        parentUnits,
        lastStable.ball,
        lastStable.unit,
        witnessListUnit,
        authors,
        witnesses,
        [message],
    );
}

async function readUtxo(addresses: Address[], mci: number, amount?: number, limit: number = 1) {
    const requireAmount = amount ? `AND amount > ${amount}` : '';
    return sqlstore.all(`
        SELECT unit, message_index, output_index, amount, blinding, address
        FROM outputs
        CROSS JOIN units USING(unit)
        WHERE address IN(${sqlstore.escape(addresses)}) AND is_spent=0 ${requireAmount}
        AND is_stable=1 AND sequence='good' AND main_chain_index<=?
        ORDER BY amount LIMIT ${limit}`,
        mci,
    );
}

async function readUtxoForAmount(addresses: Address[], lastBallMCI: number, amount: number): Promise<[TransferInput[], number]> {
    let totalAmount = 0;
    const inputsWithProofs = [];

    // first, try to find an output just bigger than the required amount
    let inputs = await readUtxo(addresses, lastBallMCI, amount, 1);
    if (inputs.length === 0) {
        // then, try to add smaller coins until we accumulate the required amount
        inputs = await readUtxo(addresses, lastBallMCI, null, conf.MAX_INPUTS_PER_PAYMENT_MESSAGE - 2);
    }

    for (const input of inputs) {
        totalAmount += input.amount;
        inputsWithProofs.push(Inputs.newTransferInput(input.unit, input.message_index, input.output_index));
        if (totalAmount > amount) {
            return [inputsWithProofs, totalAmount];
        }
    }

    return [inputsWithProofs, totalAmount];

    // still not enough, try to add earned header commission
    // TBD

    // still not enough, try to add witness commission
    // TBD
    // async function addHeadersCommissionInputs() {
    //     return addMcInputs(
    //         'headers_commission',
    //         HEADERS_COMMISSION_INPUT_SIZE,
    //         headerCommission.getMaxSpendableMciForLastBallMci(lastBallMCI),
    //     );
    // }
    //
    // async function addWitnessingInputs() {
    //     return addMcInputs(
    //         'witnessing',
    //         WITNESSING_INPUT_SIZE,
    //         payloadCommission.getMaxSpendableMciForLastBallMci(lastBallMCI),
    //     );
    // }
    //
    // async function addMcInputs(type: string, inputSize: number, maxMCI: number) {
    //     await Promise.all(addresses.map(async (address) => {
    //         const targetAmount = amount + inputSize - totalAmount;
    //         const [from, to, earnings, isSufficient] =
    //             await mcOutputs.findMcIndexIntervalToTargetAmount(type, address, maxMCI, targetAmount);
    //         totalAmount += earnings;
    //         const input = {
    //             type: type,
    //             from_main_chain_index: from,
    //             to_main_chain_index: to,
    //         };
    //         amount += inputSize;
    //         inputWithProofs.push({input: input});
    //     }));
    // }
}

