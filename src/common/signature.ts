import * as ecdsa from 'secp256k1';
import * as _ from 'lodash';
import * as ohash from './object_hash';

export interface ISigned {
    signature: Base64;
    pubKey: PubKey;
}

export default class Signature {
    static sign(hash: string | Buffer, privateKey: Buffer): Base64 {
        const res = ecdsa.sign(hash, privateKey);
        return res.signature.toString('base64');
    }

    static verify(hash: string, signature: Base64, pubKey: PubKey): boolean {
        try {
            const sig = new Buffer(signature, 'base64');
            return ecdsa.verify(hash, sig, new Buffer(pubKey, 'base64'));
        } catch (e) {
            return false;
        }
    }

    static verifySigned(signed: ISigned, signature: Base64): boolean {
        const cloned = _.clone(signed);
        delete cloned.signature;
        return this.verify(ohash.getObjHashB64(cloned), signature, signed.pubKey);
    }
}
