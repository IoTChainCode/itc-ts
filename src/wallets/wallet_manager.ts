import * as hash from '../common/hash';
import device from '../core/device';
import * as _ from 'lodash';
import sqlstore, {SqliteStore} from '../storage/sqlstore';
import logger from '../common/log';

export async function createWalletByDevices(xPubKey: string, account: number): Promise<string> {
    return createSingleSigWallet(xPubKey, account);
}

async function addWallet(wallet: string, xPubKey: string, account: number, definitionTemplates: any[]) {
    const deviceAddressesBySigningPaths = getDeviceAddressesBySigningPaths(definitionTemplates);
    const deviceAddresses = _.uniq(_.values(deviceAddressesBySigningPaths));

    await sqlstore.run(
        'INSERT INTO wallets (wallet, account, definition_template) VALUES (?,?,?)',
        wallet, account, JSON.stringify(definitionTemplates),
    );

    await Promise.all(deviceAddresses.map(async (address) => {
        return await sqlstore.all(`
            INSERT INTO extended_pubkeys (wallet, device_address, extended_pubkey, approval_date)
            VALUES (?,?,?,datetime('now'))`,
            wallet, address, xPubKey,
        );
    }));
    const signingPaths = Object.keys(deviceAddressesBySigningPaths);

    await Promise.all(signingPaths.map(async (signingPath) => {
        const deviceAddress = deviceAddressesBySigningPaths[signingPath];

        await  sqlstore.all(`
            INSERT INTO wallet_signing_paths (wallet, signing_path, device_address) VALUES (?,?,?)`,
            wallet, signingPath, deviceAddress,
        );
    }));
}

async function createWallet(xPubKey: string, account: number, definitionTemplates: any[]): Promise<string> {
    const wallet = hash.sha256B64(xPubKey);
    await addWallet(wallet, xPubKey, account, definitionTemplates);
    return wallet;
}

// walletName will not be used
async function createSingleSigWallet(xPubKey: string, account: number): Promise<string> {
    const definition = ['sig', {pubkey: '$pubkey@' + device.deviceAddress()}];
    logger.info(`create wallet, definition ${definition}`);
    return createWallet(xPubKey, account, definition);
}

function getDeviceAddresses(definitionTemplates: any[]) {
    return _.uniq(_.values(getDeviceAddressesBySigningPaths(definitionTemplates)));
}

function getDeviceAddressesBySigningPaths(definitionTemplates: any[]) {
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
                deviceAddressesBySigningPaths[path] = deviceAddress;
                break;
        }
    }

    const deviceAddressesBySigningPaths = {};
    evaluate(definitionTemplates, 'r');
    return deviceAddressesBySigningPaths;
}

export async function readAddresses(walletId: string) {
    return sqlstore.all(`
        SELECT address, address_index, is_change, ${SqliteStore.getUnixTimestamp('creation_date')}
        FROM my_addresses where wallet=?`,
        walletId,
    );
}

