import * as _ from 'lodash';
import parentComposer from './parent_composer';
import {Signer} from './signer';
import storage from '../storage/storage';
import {IssueInput, Message, Output} from './message';
import Unit from './unit';
import Author from './author';
import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import * as mcOutputs from '../core/mc_outputs';
import * as headerCommission from '../core/headers_commission';
import * as payloadCommission from '../core/payload_commission';
import {readWitnesses} from './witness';

const TRANSFER_INPUT_SIZE = 0 // type: "transfer" omitted
    + 44 // unit
    + 8 // message_index
    + 8; // output_index

const HEADERS_COMMISSION_INPUT_SIZE = 18 // type: "headers_commission"
    + 8 // from_main_chain_index
    + 8; // to_main_chain_index

const WITNESSING_INPUT_SIZE = 10 // type: "witnessing"
    + 8 // from_main_chain_index
    + 8; // to_main_chain_index

const ADDRESS_SIZE = 32;

function isGenesis() {
    return true;
}

export async function getInputs(authors: Author[],
                                targetAmount: number,
                                payingAddresses: Address[],
                                lastBallMCI: number): Promise<any[]> {
    if (isGenesis()) {
        const issueInput: IssueInput = {
            type: 'issue',
            serialNumber: 1,
            amount: conf.TOTAL,
        };
        return [issueInput];
    } else {
        const [inputs, total] = await pickDivisibleCoinsForAmount(payingAddresses, lastBallMCI, targetAmount);
        return inputs.map(input => input.input);
    }
}

export function getOutputs(outputs: Output[]): Output[] {
    const changeOutputs: Output[] = outputs.filter(output => output.amount === 0);
    const externalOutputs: Output[] = outputs.filter(output => output.amount > 0);

    const result = changeOutputs;
    for (const output of externalOutputs) {
        result.push(output);
    }

    return result;
}

export async function getParents(witnesses: Address[]): Promise<[Base64[], Base64, Base64, number]> {
    if (isGenesis()) {
        return [[], null, null, null];
    }
    const [parentUnits, lastBall] = await parentComposer.pickParentUnitsAndLastBall(witnesses);
    return [parentUnits, lastBall.ball, lastBall.unit, lastBall.mci];
}

export async function getAuthors(addresses: Address[], signer: Signer): Promise<Author[]> {
    return await Promise.all(addresses.map(async (address) => {
        const signingPathLengths = await signer.readSigningPaths(address, []);
        const signingPaths = Object.keys(signingPathLengths);
        const authentifiers: any = {};
        for (const path of signingPaths) {
            authentifiers[path] = '-'.repeat(signingPathLengths[path]);
        }
        return new Author(address, authentifiers);
    }));
}

// get ref unit, maybe null
export async function getWitnessListUnit(witnesses: Address[], lastBallMCI: number): Promise<Address> {
    if (isGenesis()) {
        return null;
    }
    // It is expected that many users will want to use exactly the same witness list.
    // In this case, to save space, they don’t list the addresses of all 12 witnesses.
    // Rather, they give a reference to another earlier unit, which listed these witnesses explicitly.
    return await storage.findWitnessListUnit(witnesses, lastBallMCI);
}

export async function getWitnesses(witnesses: Address[]): Promise<Address[]> {
    if (witnesses && witnesses.length > 0) {
        return witnesses;
    }
    return await readWitnesses();
}

export async function composeUnit(witnesses: Address[],
                                  signingAddresses: Address[],
                                  payingAddresses: Address[],
                                  outputs: Output[],
                                  signer: Signer) {
    const fromAddresses = _.union(signingAddresses, payingAddresses).sort();

    const [parentUnits, lastBall, lastBallUnit, lastBallMCI] = await getParents(witnesses);
    const witnessListUnit = await getWitnessListUnit(witnesses, lastBallMCI);
    witnesses = await getWitnesses(witnesses);
    const authors = await getAuthors(fromAddresses, signer);

    const headersCommission = 101;
    const nakedPayloadCommission = 102;

    const externalOutputs: Output[] = outputs.filter(output => output.amount > 0);
    const totalAmount = externalOutputs.reduce((acc, cur) => acc + cur.amount, 0);
    const targetAmount = totalAmount + headersCommission + nakedPayloadCommission;
    const inputs = await getInputs(authors, targetAmount, payingAddresses, lastBallMCI);
    outputs = getOutputs(outputs);
    const message = new Message('payment', 'inline', inputs, outputs);
    return new Unit(
        conf.version,
        conf.alt,
        parentUnits,
        lastBall,
        lastBallUnit,
        witnessListUnit,
        authors,
        witnesses,
        [message],
    );
}

export async function composeGenesisUnit() {
    let witnesses = [];
    for (let i = 0; i < conf.COUNT_WITNESSES; i++) {
        witnesses.push(i);
    }
    const output = new Output('change add', 0);
    const outputs = getOutputs([output]);
    witnesses = await getWitnesses(witnesses);
    const signer = new Signer();
    return composeUnit(witnesses, [], [], outputs, signer);
}

async function readAddressesUTXO(addresses: Address[], mci: number, amount?: number, limit: number = 1) {
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

// arrAddresses is paying addresses
// all inputs must appear before last_ball
async function pickDivisibleCoinsForAmount(addresses: Address[], lastBallMCI: number, requiredAmount: number): Promise<any[]> {
    const inputWithProofs = [];
    let totalAmount = 0;

    // adds element to arrInputsWithProofs
    function addInput(input) {
        totalAmount += input.amount;
        delete input.amount;
        delete input.blinding;
        const inputWithProof = {input: input};
        inputWithProofs.push(inputWithProof);
    }

    // first, try to find an output just bigger than the required amount
    let inputs = await readAddressesUTXO(addresses, lastBallMCI, requiredAmount, 1);

    if (inputs) {
        addInput(inputs[0]);
        return [inputWithProofs, totalAmount];
    }

    // then, try to add smaller coins until we accumulate the required amount
    inputs = await readAddressesUTXO(addresses, lastBallMCI, null, conf.MAX_INPUTS_PER_PAYMENT_MESSAGE - 2);

    for (const input of inputs) {
        requiredAmount += TRANSFER_INPUT_SIZE;
        addInput(input);
        if (totalAmount > requiredAmount) {
            return [inputWithProofs, totalAmount];
        }
    }

    return [null, null];

    async function addHeadersCommissionInputs() {
        return addMcInputs(
            'headers_commission',
            HEADERS_COMMISSION_INPUT_SIZE,
            headerCommission.getMaxSpendableMciForLastBallMci(lastBallMCI),
        );
    }

    async function addWitnessingInputs() {
        return addMcInputs(
            'witnessing',
            WITNESSING_INPUT_SIZE,
            payloadCommission.getMaxSpendableMciForLastBallMci(lastBallMCI),
        );
    }

    async function addMcInputs(type: string, inputSize: number, maxMCI: number) {
        await Promise.all(addresses.map(async (address) => {
            const targetAmount = requiredAmount + inputSize - totalAmount;
            const [from, to, earnings, isSufficient] =
                await mcOutputs.findMcIndexIntervalToTargetAmount(type, address, maxMCI, targetAmount);
            totalAmount += earnings;
            const input = {
                type: type,
                from_main_chain_index: from,
                to_main_chain_index: to,
            };
            requiredAmount += inputSize;
            inputWithProofs.push({input: input});
        }));
    }
}

