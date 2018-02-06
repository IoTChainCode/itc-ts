import {Device} from '../core/device';
import * as _ from 'lodash';
import sqlstore from '../storage/sqlstore';
import HDKey from '../common/HDKey';
import * as Bitcore from 'bitcore-lib';
import Wallet from './wallet';
import HDKeys from '../common/HDKeys';
import XPubKeys from '../models/XPubKeys';
import logger from '../common/log';

export default class Wallets {
    static async readWalletIds(): Promise<Base64[]> {
        const rows = await sqlstore.all('SELECT wallet FROM wallets');
        return rows.map(row => row.wallet);
    }

    static async read() {
        return sqlstore.all('select * from wallets');
    }

    static async create(key: HDKey): Promise<Wallet> {
        const device = new Device(key.devicePrivKey);
        const derived = key.xPrivKey.derive(0, 0);
        const xPubKeyStr = new Bitcore.HDPublicKey(derived).toString();
        const wallet = key.walletId;
        const definition = ['sig', {pubkey: '$pubkey@' + device.deviceAddress()}];
        const deviceAddressesBySigningPaths = getDeviceAddressesBySigningPaths(definition);
        const deviceAddresses = _.uniq([...deviceAddressesBySigningPaths.values()]);

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

        for (const [path, address] of deviceAddressesBySigningPaths) {
            await  sqlstore.run(`
            INSERT INTO wallet_signing_paths (wallet, signing_path, device_address) VALUES (?,?,?)`,
                wallet, path, address,
            );
        }

        return new Wallet(wallet, key);
    }

    static async readWalletAddresses(wallet: string): Promise<Address[]> {
        const rows = await sqlstore.all(
            `SELECT address FROM my_addresses where wallet=?`,
            wallet,
        );
        return rows.map(row => row.address);
    }

    static async readOrCreate(passphrase?: string, keyPath?: string): Promise<Wallet> {
        const key = await HDKeys.readOrCreate(passphrase, keyPath);
        const device = new Device(key.devicePrivKey);
        const wallet = key.walletId;
        if (await Wallets.isWalletExists(wallet)) {
            logger.info(`wallet ${wallet} exists`);
            const pk = await XPubKeys.findByDeviceAddress(device.deviceAddress());
            logger.info(`pk: ${pk}`);
            if (!pk) {
                throw Error('incorrect passphrase');
            }
            return new Wallet(wallet, key);
        } else {
            logger.info(`wallet ${wallet} does not exist, will create`);
            return Wallets.create(key);
        }
    }

    static async isWalletExists(wallet?: string) {
        if (!wallet) {
            const rows = await sqlstore.all('SELECT wallet FROM wallets');
            return rows.length > 0;
        } else {
            const rows = await sqlstore.all('SELECT wallet FROM wallets where wallet=?', wallet);
            return rows.length > 0;
        }
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
