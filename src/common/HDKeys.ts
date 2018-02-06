import * as fs from 'fs-extra';
import * as rl from 'readline-sync';
import * as  Mnemonic from 'bitcore-mnemonic';
import * as  Bitcore from 'bitcore-lib';
import HDKey from './HDKey';
import * as conf from '../common/conf';
import logger from './log';

export type KeyStore = {
    mnemonic: string,
};

export default class HDKeys {
    static async readOrCreate(passphrase?: string, path?: string): Promise<HDKey> {
        if (passphrase === undefined) {
            passphrase = rl.question('Passphrase: ');
        }
        if (path === undefined) {
            path = conf.KEY_STORE_PATH;
        }

        try {
            const data = await fs.readFile(path, 'utf8');
            const keyStore: KeyStore = JSON.parse(data);
            return HDKeys.createByMnemonic(keyStore.mnemonic, passphrase);
        } catch (e) {
            logger.info(`failed to read key at ${path}, will gen by passphrase`);
            const key = HDKeys.createByPassphrase(passphrase);
            await key.save(path);
            return key;
        }
    }

    static createByPassphrase(passphrase: string): HDKey {
        let mnemonic = new Mnemonic(); // generates new mnemonic
        while (!Mnemonic.isValid(mnemonic.toString()))
            mnemonic = new Mnemonic();

        const xPrivKey = mnemonic.toHDPrivateKey(passphrase);
        return new HDKey(xPrivKey, mnemonic.toString());
    }

    static createByMnemonic(mnemonicPhrase: string, passphrase: string) {
        const mnemonic = new Mnemonic(mnemonicPhrase);
        const xPrivKey = mnemonic.toHDPrivateKey(passphrase);
        return new HDKey(xPrivKey, mnemonicPhrase);
    }

    static derivePubKey(xPubKeyStr: PubKey, isChange: number, addressIndex: number): PubKey {
        const xPubKey = new Bitcore.HDPublicKey(xPubKeyStr);
        return xPubKey.derive(isChange).derive(addressIndex).publicKey.toBuffer().toString('base64');
    }
}
