import * as Bitcore from 'bitcore-lib';
import * as Mnemonic from 'bitcore-mnemonic';

export default class Account {
    readonly derivationStrategy = 'BIP44'; // 'BIP48'
    readonly hdPublicKey: any;
    readonly publicKeyRing: any[];

    wallet: string;

    private constructor(readonly account: number = 0,
                        readonly hdPrivateKey?: any,
                        readonly mnemonic?: string) {

        const addressDerivation =
            this.hdPrivateKey.derive(Account.getBaseAddressDerivationPath(this.derivationStrategy));

        this.hdPublicKey = new Bitcore.HDPublicKey(addressDerivation);
        this.publicKeyRing = [{
            hdPubKey: this.hdPublicKey.toString(),
        }];
    }

    static create(account: number = 0): Account {
        const hdPrivateKey = new Bitcore.HDPrivateKey();
        return new Account(account, hdPrivateKey);
    }

    static createWithMnemonic(passphrase: string, account: number = 0): Account {
        let m = new Mnemonic(Mnemonic.Words.ENGLISH);
        while (!Mnemonic.isValid(m.toString())) {
            m = new Mnemonic(Mnemonic.Words.ENGLISH);
        }

        console.log(m);

        const hdPrivateKey = m.toHDPrivateKey(passphrase);
        const mnemonicWords = m.phrase;

        return new Account(
            account,
            hdPrivateKey,
            mnemonicWords,
        );
    }

    static getBaseAddressDerivationPath(derivationStrategy: string): string {
        let purpose;
        switch (derivationStrategy) {
            case 'BIP44':
                purpose = '44';
                break;
            case 'BIP48':
                purpose = '48';
                break;
        }
        return `m/${purpose}/1/0`;
    }
}
