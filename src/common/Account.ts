import * as fs from 'fs-extra';
import * as path from 'path';
import {KeyStore} from './Accounts';

export default class Account {

    constructor(readonly xPrivKey, readonly mnemonic: string) {}

    async save(filePath: string) {
        const keystore: KeyStore = {
            mnemonic: this.mnemonic,
        };
        await fs.mkdirp(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(keystore), 'utf-8');
    }
}
