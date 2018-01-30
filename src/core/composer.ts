import * as _ from 'lodash';
import {Signer} from './signer';
import storage from '../storage/storage';
import {IssueInput, Message, Output} from './message';
import Unit from './unit';
import Author from './author';
import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import {readWitnesses} from './witness';
import composeParent from './composeParent';
import Authentifier from './authentifiers';

function isGenesis() {
    // TODO
    return true;
}

export async function composeGenesisInputs() {
    const issueInput: IssueInput = {
        type: 'issue',
        serialNumber: 1,
        amount: conf.TOTAL,
    };
    return [issueInput];
}

export async function composeInputs(authors: Author[],
                                    targetAmount: number,
                                    payingAddresses: Address[],
                                    lastBallMCI: number): Promise<[any[], number]> {
    if (isGenesis()) {
        return [await composeGenesisInputs(), 0];
    } else {
        const [inputs, total] = await readUtxoForAmount(payingAddresses, lastBallMCI, targetAmount);
        return [inputs.map(input => input.input), total];
    }
}

export function composeOutputs(outputs: Output[], changeAddress: Address, change: number): Output[] {
    const changeOutput = new Output(changeAddress, change);
    return [changeOutput].concat(outputs.filter(output => output.amount > 0));
}

export async function composeAuthors(addresses: Address[], signer: Signer): Promise<Author[]> {
    return await Promise.all(addresses.map(async (address) => {
        const signingPathLengths = await signer.readSigningPaths(address, []);
        const signingPaths = Object.keys(signingPathLengths);
        const authentifiers: Authentifier[] = [];
        for (const path of signingPaths) {
            authentifiers.push(new Authentifier(path, '-'.repeat(signingPathLengths[path])));
            authentifiers[path] = '-'.repeat(signingPathLengths[path]); // placeholder
        }
        return new Author(address, authentifiers);
    }));
}

export async function composeWitnessListUnit(witnesses: Address[], lastBallMCI: number): Promise<Address> {
    if (isGenesis()) {
        return null;
    }
    return await storage.findWitnessListUnit(witnesses, lastBallMCI);
}

export async function composeUnit(witnesses: Address[],
                                  signingAddresses: Address[],
                                  payingAddresses: Address[],
                                  changeAddress: Address,
                                  outputs: Output[],
                                  signer: Signer) {
    const fromAddresses = _.union(signingAddresses, payingAddresses).sort();

    const [parentUnits, lastStable] = await composeParent(witnesses, isGenesis());
    const witnessListUnit = await composeWitnessListUnit(witnesses, lastStable.mci);
    if (!witnessListUnit && !witnesses) {
        witnesses = await readWitnesses();
    }

    const authors = await composeAuthors(fromAddresses, signer);
    const externalOutputs: Output[] = outputs.filter(output => output.amount > 0);
    const outputAmount = externalOutputs.reduce((acc, cur) => acc + cur.amount, 0);
    const [inputs, inputAmount] = await composeInputs(authors, outputAmount, payingAddresses, lastStable.mci);
    const headersCommission = 0;
    const payloadCommission = 0;
    const changeAmount = inputAmount - outputAmount - headersCommission - payloadCommission;
    const finalOutputs = composeOutputs(outputs, changeAddress, changeAmount);
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
        WHERE address IN(?) AND is_spent=0 ${requireAmount}
        AND is_stable=1 AND sequence='good' AND main_chain_index <= ?
        ORDER BY amount LIMIT ${limit}`,
        addresses, mci,
    );
}

async function readUtxoForAmount(addresses: Address[], lastBallMCI: number, amount: number): Promise<[any[], number]> {
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
        inputsWithProofs.push(input);
        if (totalAmount > amount) {
            return [inputsWithProofs, totalAmount];
        }
    }

    throw Error('still not enough');

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

