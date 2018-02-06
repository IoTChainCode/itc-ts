import * as fs from 'fs-extra';
import * as path from 'path';
import {KeyStore} from './HDKeys';
import {sha256B64} from './hash';
import * as chash from './checksum_hash';
import * as secp256k1 from 'secp256k1';

export default class HDKey {
    readonly xPubKey;
    readonly walletId: Base64;
    readonly devicePrivKey: DevicePrivKey;
    readonly devicePubKey: DevicePubKey;

    constructor(readonly xPrivKey, readonly mnemonic: string) {
        this.xPubKey = xPrivKey.hdPublicKey;
        this.walletId = sha256B64(this.xPubKey.toString());
        this.devicePrivKey = HDKey.deriveDevicePrivKey(this.xPrivKey);
        this.devicePubKey = secp256k1.publicKeyCreate(this.devicePrivKey, true).toString('base64');
    }

    async save(filePath: string) {
        const keystore: KeyStore = {
            mnemonic: this.mnemonic,
        };
        await fs.mkdirp(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(keystore), 'utf-8');
    }

    deriveBIP44(type: number, account: number, change: number, addressIndex: number) {
        const purpose = 44;
        return this.xPrivKey.derive(purpose, true).derive(type, true).derive(account, true)
            .derive(change)
            .derive(addressIndex);
    }

    derivePublicKey(isChange: number, addressIndex: number) {
        return this.xPubKey.derive(isChange).derive(addressIndex);
    }

    static deriveDevicePrivKey(xPrivKey): DevicePrivKey {
        return xPrivKey.derive(1, true).privateKey.bn.toBuffer({size: 32});
    }

    deriveDeviceAddress(): DeviceAddress {
        return '0' + chash.getChash160(this.devicePubKey);
    }
}
