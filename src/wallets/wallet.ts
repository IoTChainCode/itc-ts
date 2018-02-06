import sqlstore from '../storage/sqlstore';
import {Signer} from '../core/signer';
import * as balances from '../core/balances';
import {Balances} from '../core/balances';
import Wallets from './Wallets';
import HDKey from '../common/HDKey';
import logger from '../common/log';
import * as composer from '../core/composer';
import network from '../network/Peer';
import Units from '../models/Units';

const TYPICAL_FEE = 1000;
const MAX_FEE = 20000;

export default class Wallet {
    signer: Signer;

    constructor(
        readonly wallet: Base64,
        readonly key: HDKey,
    ) {
        this.signer = new Signer(this.key.xPrivKey);
    }

    async address(): Promise<Address> {
        const addresses = await Wallets.readWalletAddresses(this.wallet);
        return addresses[0];
    }

    async readBalance(address?: Address): Promise<Balances> {
        if (!address) {
            address = await this.address();
        }
        return balances.readBalance(address);
    }

    async sendPayment(to: Address, amount: number, witnesses: Address[]) {
        const changeAddress = await this.address();
        const [fundedAddresses, signingAddresses] = await readFundedAndSigningAddresses(
            this.wallet, amount + TYPICAL_FEE, []);

        logger.info({fundedAddresses, signingAddresses}, 'send payment');

        const outputs = [{
            address: to,
            amount: amount,
        }];

        const unit = await composer.composeUnit(
            witnesses,
            signingAddresses,
            fundedAddresses,
            changeAddress,
            outputs,
            this.signer,
        );

        for (const author of unit.authors) {
            author.authentifiers['r'] = await this.signer.sign(unit, author.address, 'r');
        }

        unit.unit = unit.calcUnit();
        unit.ball = unit.calcBall();

        logger.info(unit, 'sendPayment');

        // save
        await Units.save(unit, 'good');

        // broadcast
        await network.broadcastUnit(unit);
    }
}

async function readFundedAndSigningAddresses(
    walletId: Base64,
    estimatedAmount: number,
    signingAddresses: Address[],
): Promise<[Address[], Address[]]> {
    const fundedAddresses = await readFundedAddresses(walletId, estimatedAmount);
    logger.info(fundedAddresses, 'readFundedAddresses');
    return [fundedAddresses, signingAddresses];
}

async function readFundedAddresses(wallet: Base64, estimatedAmount: number): Promise<Address[]> {
    // find my paying utxo addresses
    // sort by |amount - estimatedAmount|
    const orderBy = `(SUM(amount) > ${estimatedAmount}) DESC, ABS(SUM(amount)-${estimatedAmount}) ASC`;
    const utxo = await sqlstore.all(`
            SELECT address, SUM(amount) AS total
            FROM outputs JOIN my_addresses USING(address)
            CROSS JOIN units USING(unit)
            WHERE wallet=? AND is_stable=1 AND sequence='good' AND is_spent=0 AND asset IS NULL
            AND NOT EXISTS (
                SELECT * FROM unit_authors JOIN units USING(unit)
                WHERE is_stable=0 AND unit_authors.address=outputs.address AND definition_chash IS NOT NULL
            )
            GROUP BY address ORDER BY ${orderBy}`,
        wallet,
    );

    const fundedAddresses = [];
    let accumulatedAmount = 0;
    for (let i = 0; i < utxo.length; i++) {
        fundedAddresses.push(utxo[i].address);
        accumulatedAmount += utxo[i].total;
        if (accumulatedAmount > estimatedAmount + MAX_FEE) {
            break;
        }
    }
    return fundedAddresses;
}
