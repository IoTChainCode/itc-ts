import * as hash from '../common/hash';
import {Device} from '../core/device';
import * as _ from 'lodash';
import sqlstore from '../storage/sqlstore';
import Account from '../common/Account';
import * as Bitcore from 'bitcore-lib';
import Wallet from './wallet';
import Accounts from '../common/Accounts';

export default class Wallets {
    static async readWalletIds(): Promise<Base64[]> {
        const rows = await sqlstore.all('SELECT wallet FROM wallets');
        return rows.map(row => row.wallet);
    }

    static async create(account: Account, device: Device): Promise<Wallet> {
        const derived = account.xPrivKey.derive(44, true).derive(0, true).derive(0, true);
        const xPubKeyStr = new Bitcore.HDPublicKey(derived).toString();
        const wallet = hash.sha256B64(xPubKeyStr);
        const definition = ['sig', {pubkey: '$pubkey@' + device.deviceAddress()}];
        const deviceAddressesBySigningPaths = getDeviceAddressesBySigningPaths(definition);
        const deviceAddresses = _.uniq(_.values(deviceAddressesBySigningPaths));

        await sqlstore.run(
            'INSERT INTO wallets (wallet, account, definition_template) VALUES (?,?,?)',
            wallet, 0, JSON.stringify(definition),
        );

        await Promise.all(deviceAddresses.map(async (address) => {
            return sqlstore.run(`
                INSERT INTO extended_pubkeys (wallet, device_address, extended_pubkey, approval_date)
                VALUES (?,?,?,datetime('now'))`,
                wallet, address, xPubKeyStr,
            );
        }));

        const signingPaths = Object.keys(deviceAddressesBySigningPaths);
        await Promise.all(signingPaths.map(async (signingPath) => {
            const deviceAddress = deviceAddressesBySigningPaths[signingPath];
            await  sqlstore.run(`
            INSERT INTO wallet_signing_paths (wallet, signing_path, device_address) VALUES (?,?,?)`,
                wallet, signingPath, deviceAddress,
            );
        }));

        return new Wallet(wallet, account);
    }

    static async readWalletAddresses(wallet: string): Promise<Address[]> {
        const rows = await sqlstore.all(
            `SELECT address FROM my_addresses where wallet=?`,
            wallet,
        );
        return rows.map(row => row.address);
    }

    static async readOrCreate(passphrase?: string): Promise<Wallet> {
        const account = await Accounts.readOrCreate(passphrase);
        const devicePrivKey = account.xPrivKey.derive(1, true).privateKey.bn.toBuffer({size: 32});
        const device = new Device(devicePrivKey);
        if (await Wallets.isWalletExists()) {
            const wallet = (await Wallets.readWalletIds())[0];
            const rows = await sqlstore.all('SELECT 1 FROM extended_pubkeys WHERE device_address=?', device.deviceAddress());
            if (rows.length > 1)
                throw Error('more than 1 extended pubkey');
            if (rows.length === 0)
                throw Error('passphrase is incorrect');
            return new Wallet(wallet, account);
        } else {
            return Wallets.create(account, device);
        }
    }

    static async isWalletExists() {
        const rows = await sqlstore.all('SELECT wallet FROM wallets');
        return rows.length > 0;
    }
}

function getDeviceAddressesBySigningPaths(definitionTemplates: any[]): Map<string, string> {
    function evaluate(arr: any[], path: string) {
        const op = arr[0];
        const args = arr[1];
        if (!args)
            return;
        const prefix = '$pubkey@';
        switch (op) {
            case 'sig':
                if (!args.pubkey || args.pubkey.substr(0, prefix.length) !== prefix)
                    return;
                const deviceAddress = args.pubkey.substr(prefix.length);
                deviceAddressesBySigningPaths.set(path, deviceAddress);
                break;
        }
    }

    const deviceAddressesBySigningPaths = new Map();
    evaluate(definitionTemplates, 'r');
    return deviceAddressesBySigningPaths;
}
