import {Output} from '../core/message';
import sqlstore from '../storage/sqlstore';
import {composeUnit} from '../core/composer';
import logger from '../common/log';
import network from '../network/Peer';
import Wallet from '../wallets/wallet';
import MainChain from '../models/MainChain';
import Wallets from '../wallets/Wallets';
import MyAddresses from '../models/MyAddresses';

const WITNESSING_COST = 600; // size of typical witnessing unit
const THRESHOLD_DISTANCE = 50;
const MIN_AVAILABLE_WITNESSINGS = 100;

async function determineIfThereAreMyUnitsWithoutMci(address: Address) {
    const rows = await sqlstore.all(
        'SELECT 1 FROM units JOIN unit_authors USING(unit) WHERE address=? AND main_chain_index IS NULL LIMIT 1',
        address,
    );
    return rows.length > 0;
}


async function readNumberOfWitnessingsAvailable(address: Address, available: number): Promise<number> {
    if (available > MIN_AVAILABLE_WITNESSINGS)
        return available;
    let rows = await sqlstore.all(`
        SELECT COUNT(*) AS count_big_outputs FROM outputs JOIN units USING(unit)
        WHERE address=? AND is_stable=1 AND amount>=? AND asset IS NULL AND is_spent=0`,
        address, WITNESSING_COST,
    );
    const numBigOutputs = rows[0].count_big_outputs;
    logger.info(`count of big outputs(>= ${WITNESSING_COST}) ${numBigOutputs}`);

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
    return numBigOutputs + paid;
}


export class Witness {
    available = 0; // available count of witnessings
    forcedWitnessingTimer;
    isWitnessingUnderWay = false;

    constructor(readonly wallet: Wallet) {
    }

    async start() {
        const address = await this.wallet.address();
        await this.checkAndWitness(this.wallet, address);
    }

    // make sure we never run out of spendable (stable) outputs.
    // Keep the number above a threshold, and if it drops below, produce more outputs than consume.
    async createOptimalOutputs(address: Address): Promise<Output[]> {
        const outputs = [];
        this.available = await readNumberOfWitnessingsAvailable(address, this.available);
        if (this.available > MIN_AVAILABLE_WITNESSINGS)
            return outputs;
        // try to split the biggest output in two
        const row = await sqlstore.get(`
        SELECT amount FROM outputs JOIN units USING(unit)
        WHERE address=? AND is_stable=1 AND amount>=? AND asset IS NULL AND is_spent=0
        ORDER BY amount DESC LIMIT 1`,
            address, 2 * WITNESSING_COST,
        );
        if (!row) {
            logger.info(`only ${this.available} spendable outputs left`);
        } else {
            const amount = row.amount;
            logger.info(`only ${this.available} spendable outputs left, will split an output of ${amount}`);
            outputs.push({amount: Math.round(amount / 2), address: address});
        }
        return outputs;
    }

    async checkAndWitness(wallet: Wallet, address: Address) {
        clearTimeout(this.forcedWitnessingTimer);
        if (this.isWitnessingUnderWay)
            return logger.info('witnessing under way');
        this.isWitnessingUnderWay = true;
        // abort if there are my units without an mci
        const myUnitsWithoutMci = await determineIfThereAreMyUnitsWithoutMci(address);
        if (myUnitsWithoutMci) {
            this.isWitnessingUnderWay = false;
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
            logger.info('distance=' + distance);
            if (distance > THRESHOLD_DISTANCE) {
                logger.info('distance above threshold, will witness');
                try {
                    await this.witness(wallet, address);
                } catch (e) {
                    logger.warn(e, 'wait and try again');
                    setTimeout(async () => this.checkAndWitness(wallet, address), 60000);
                } finally {
                    this.isWitnessingUnderWay = false;
                }
            } else {
                return this.checkForUnconfirmedUnits(THRESHOLD_DISTANCE - distance);
            }
        }
    }

    async witness(wallet: Wallet, address: Address) {
        const outputs = await this.createOptimalOutputs(address);
        logger.info(outputs, 'witness outputs');
        const payingAddresses = [address];
        const unit = await composeUnit([], [], payingAddresses, address, outputs, wallet.signer);
        logger.info(unit, 'witness unit');
        return network.broadcastUnit(unit);
    }

    async checkForUnconfirmedUnits(distance2threshold: number) {
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
        logger.info('scheduling unconditional witnessing in ' + timeout + ' ms unless a new unit arrives');
        this.forcedWitnessingTimer = setTimeout(this.witnessBeforeThreshold, timeout);
    }

    async witnessBeforeThreshold(wallet: Wallet, address: Address) {
        if (this.isWitnessingUnderWay)
            return;
        this.isWitnessingUnderWay = true;
        const myUnitsWithoutMci = await determineIfThereAreMyUnitsWithoutMci(address);
        if (myUnitsWithoutMci) {
            this.isWitnessingUnderWay = false;
            return;
        }
        logger.info('will witness before threshold');
        await this.witness(wallet, address);
        this.isWitnessingUnderWay = false;
    }
}

async function main() {
    const wallet = await Wallets.readOrCreate('');
    logger.info(wallet, 'witness wallet');
    const address = await MyAddresses.issueOrSelectNextAddress(wallet.wallet, 0);
    logger.info({address}, 'witness address');

    const witness = new Witness(wallet);
    await witness.start();
}

(async () => {
    await main();
})();
