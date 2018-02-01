import * as fs from 'fs-extra';
import * as rl from 'readline-sync';
import * as  Mnemonic from 'bitcore-mnemonic';
import Account from './Account';
import * as conf from '../common/conf';

export type KeyStore = {
    mnemonic: string,
};

export default class Accounts {
    static async readOrCreate(passphrase?: string): Promise<Account> {
        if (!passphrase) {
            passphrase = rl.question('Passphrase: ');
        }
        try {
            // readWitnessList
            const data = await fs.readFile(conf.KEY_STORE_PATH, 'utf8');
            const keyStore: KeyStore = JSON.parse(data);
            if (!passphrase) {
                passphrase = rl.question('Passphrase: ');
            }
            return Accounts.createByMnemonic(keyStore.mnemonic, passphrase);
        } catch (e) {
            console.log(`failed to read account at ${conf.KEY_STORE_PATH}, will gen by passphrase`);
            const account = Accounts.createByPassphrase(passphrase);
            await account.save(conf.KEY_STORE_PATH);
            return account;
        }
    }

    static createByPassphrase(passphrase: string): Account {
        let mnemonic = new Mnemonic(); // generates new mnemonic
        while (!Mnemonic.isValid(mnemonic.toString()))
            mnemonic = new Mnemonic();

        const xPrivKey = mnemonic.toHDPrivateKey(passphrase);
        return new Account(xPrivKey, mnemonic.toString());
    }

    static createByMnemonic(mnemonicPhrase: string, passphrase: string) {
        const mnemonic = new Mnemonic(mnemonicPhrase);
        const xPrivKey = mnemonic.toHDPrivateKey(passphrase);
        return new Account(xPrivKey, mnemonicPhrase);
    }
}
