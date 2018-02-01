import {Output} from '../core/message';
import sqlstore from '../storage/sqlstore';
import {composeUnit} from '../core/composer';
import logger from '../common/log';
import network from '../network/Network';
import Wallet from '../wallets/wallet';
import MainChain from '../models/MainChain';

const WITNESSING_COST = 600; // size of typical witnessing unit
const THRESHOLD_DISTANCE = 50;
const MIN_AVAILABLE_WITNESSINGS = 100;
let witnessingsAvailable = 0;
let isWitnessingUnderWay = false;
let forcedWitnessingTimer;

function notifyAdminAboutFailedWitnessing(err) {
    logger.error('witnessing failed: ' + err);
}

function notifyAdminAboutWitnessingProblem(err) {
    logger.error('witnessing problem: ' + err);
}

async function witness(wallet: Wallet, address: Address) {
    const outputs = await createOptimalOutputs(address);
    const payingAddresses = [address];
    const unit = await composeUnit([], [], payingAddresses, null, outputs, wallet.signer);
    return network.broadcastUnit(unit);
}

async function checkAndWitness(wallet: Wallet, address: Address) {
    console.log('checkAndWitness');
    clearTimeout(forcedWitnessingTimer);
    if (isWitnessingUnderWay)
        return console.log('witnessing under way');
    isWitnessingUnderWay = true;
    // abort if there are my units without an mci
    const myUnitsWithoutMci = await determineIfThereAreMyUnitsWithoutMci(address);
    if (myUnitsWithoutMci) {
        isWitnessingUnderWay = false;
    } else {
        const maxMCI = 0;
        const rows = await sqlstore.all(`
            SELECT main_chain_index AS max_my_mci 
            FROM units JOIN unit_authors USING(unit) 
            WHERE +address=? ORDER BY unit_authors.rowid
            DESC LIMIT 1`,
            address,
        );
        const myMaxMCI = (rows.length > 0) ? rows[0].max_my_mci : -1000;
        const distance = maxMCI - myMaxMCI;
        console.log('distance=' + distance);
        if (distance > THRESHOLD_DISTANCE) {
            console.log('distance above threshold, will witness');
            setTimeout(async () => {
                await witness(wallet, address);
                isWitnessingUnderWay = false;
            }, Math.round(Math.random() * 3000));
        }
        else {
            isWitnessingUnderWay = false;
            return checkForUnconfirmedUnits(THRESHOLD_DISTANCE - distance);
        }
    }
}

async function determineIfThereAreMyUnitsWithoutMci(address: Address) {
    const rows = await sqlstore.all(
        'SELECT 1 FROM units JOIN unit_authors USING(unit) WHERE address=? AND main_chain_index IS NULL LIMIT 1',
        address,
    );
    return rows.length > 0;
}

async function checkForUnconfirmedUnits(distance2threshold: number) {
    const rows = await sqlstore.all(`
        SELECT 1 FROM units CROSS JOIN unit_authors USING(unit) LEFT JOIN my_witnesses USING(address)
        WHERE (main_chain_index>? OR main_chain_index IS NULL AND sequence='good')
            AND my_witnesses.address IS NULL
            AND NOT (
                (SELECT COUNT(*) FROM messages WHERE messages.unit=units.unit)=1
                AND (SELECT COUNT(*) FROM unit_authors WHERE unit_authors.unit=units.unit)=1
                AND (SELECT COUNT(DISTINCT address) FROM outputs WHERE outputs.unit=units.unit)=1
                AND (SELECT address FROM outputs WHERE outputs.unit=units.unit LIMIT 1)=unit_authors.address
            )
        LIMIT 1`,
        MainChain.minRetrievableMCI(),
    );

    if (rows.length === 0)
        return;

    const timeout = Math.round((distance2threshold + Math.random()) * 10000);
    console.log('scheduling unconditional witnessing in ' + timeout + ' ms unless a new unit arrives');
    forcedWitnessingTimer = setTimeout(witnessBeforeThreshold, timeout);
}

async function witnessBeforeThreshold(wallet: Wallet, address: Address) {
    if (isWitnessingUnderWay)
        return;
    isWitnessingUnderWay = true;
    const myUnitsWithoutMci = await determineIfThereAreMyUnitsWithoutMci(address);
    if (myUnitsWithoutMci) {
        isWitnessingUnderWay = false;
        return;
    }
    console.log('will witness before threshold');
    await witness(wallet, address);
    isWitnessingUnderWay = false;
}

async function readNumberOfWitnessingsAvailable(address: Address): Promise<number> {
    witnessingsAvailable--;
    if (witnessingsAvailable > MIN_AVAILABLE_WITNESSINGS)
        return witnessingsAvailable;
    let rows = await sqlstore.all(`
        SELECT COUNT(*) AS count_big_outputs FROM outputs JOIN units USING(unit)
        WHERE address=? AND is_stable=1 AND amount>=? AND asset IS NULL AND is_spent=0`,
        address, WITNESSING_COST,
    );
    const count_big_outputs = rows[0].count_big_outputs;
    rows = await sqlstore.all(`
        SELECT SUM(amount) AS total FROM outputs JOIN units USING(unit)
        WHERE address=? AND is_stable=1 AND amount<? AND asset IS NULL AND is_spent=0
        UNION
        SELECT SUM(amount) AS total FROM witnessing_outputs
        WHERE address=? AND is_spent=0
        UNION
        SELECT SUM(amount) AS total FROM headers_commission_outputs
        WHERE address=? AND is_spent=0`,
        address, WITNESSING_COST, address, address,
    );
    const total = rows.reduce((acc, cur) => acc + cur.total, 0);
    const paid = Math.round(total / WITNESSING_COST);
    witnessingsAvailable = count_big_outputs + paid;
    return witnessingsAvailable;
}

// make sure we never run out of spendable (stable) outputs.
// Keep the number above a threshold, and if it drops below, produce more outputs than consume.
async function createOptimalOutputs(address: Address): Promise<Output[]> {
    const outputs = [{amount: 0, address: address}];
    const count = await readNumberOfWitnessingsAvailable(address);
    if (count > MIN_AVAILABLE_WITNESSINGS)
        return outputs;
    // try to split the biggest output in two
    const rows = await sqlstore.all(`
        SELECT amount FROM outputs JOIN units USING(unit)
        WHERE address=? AND is_stable=1 AND amount>=? AND asset IS NULL AND is_spent=0
        ORDER BY amount DESC LIMIT 1`,
        address, 2 * WITNESSING_COST,
    );
    if (rows.length === 0) {
        notifyAdminAboutWitnessingProblem('only ' + count + ' spendable outputs left, and can\'t add more');
        return outputs;
    }
    const amount = rows[0].amount;
    notifyAdminAboutWitnessingProblem('only ' + count + ' spendable outputs left, will split an output of ' + amount);
    outputs.push({amount: Math.round(amount / 2), address: address});
    return outputs;
}

export class Witness {
    constructor(readonly wallet: Wallet) {
    }

    async start() {
        const myAddress = await this.wallet.address();
        clearTimeout(forcedWitnessingTimer);
        if (isWitnessingUnderWay)
            return console.log('witnessing under way');
        isWitnessingUnderWay = true;
        // abort if there are my units without an mci
        const myUnitsWithoutMci = await determineIfThereAreMyUnitsWithoutMci(myAddress);
        if (myUnitsWithoutMci) {
            isWitnessingUnderWay = false;
        } else {
            const maxMCI = 0;
            const rows = await sqlstore.all(`
            SELECT main_chain_index AS max_my_mci 
            FROM units JOIN unit_authors USING(unit) 
            WHERE +address=? ORDER BY unit_authors.rowid
            DESC LIMIT 1`,
                myAddress,
            );
            const myMaxMCI = (rows.length > 0) ? rows[0].max_my_mci : -1000;
            const distance = maxMCI - myMaxMCI;
            console.log('distance=' + distance);
            if (distance > THRESHOLD_DISTANCE) {
                console.log('distance above threshold, will witness');
                setTimeout(async () => {
                    await witness(this.wallet, myAddress);
                    isWitnessingUnderWay = false;
                }, Math.round(Math.random() * 3000));
            }
            else {
                isWitnessingUnderWay = false;
                return checkForUnconfirmedUnits(THRESHOLD_DISTANCE - distance);
            }
        }
    }
}
