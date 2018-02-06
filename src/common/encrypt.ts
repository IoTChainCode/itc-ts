import * as crypto from 'crypto';
import {ECDH} from 'crypto';

export type EncryptedPackage = {
    encrypted_message: string,
    iv: Base64,
    authtag: Base64,
    dh: {
        sender_ephemeral_pubkey: PubKey,
        recipient_ephemeral_pubkey: PubKey,
    },
};

export interface IEncrypt {
    encryptMessage(json: any, pubKey: PubKey);

    decryptPackage(encrypted: EncryptedPackage, pubKey: PubKey, privateKey: DevicePrivKey);
}

function deriveSharedSecret(ecdh: ECDH, peerPubKey: PubKey): Buffer {
    const sharedSecretSrc = ecdh.computeSecret(peerPubKey, 'base64');
    return crypto.createHash('sha256').update(sharedSecretSrc).digest().slice(0, 16);
}


class Encrypt implements IEncrypt {
    encryptMessage(obj: any, pubKey: PubKey) {
        const json = JSON.stringify(obj);
        const ecdh = crypto.createECDH('secp256k1');
        const senderEphemeralPubKey = ecdh.generateKeys('base64', 'compressed');
        const sharedSecret = deriveSharedSecret(ecdh, pubKey);

        // we could also derive iv from the unused bits of ecdh.computeSecret() and save some bandwidth
        // 128 bits (16 bytes) total, we take 12 bytes for random iv and leave 4 bytes for the counter
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-128-gcm', sharedSecret, iv);
        // under browserify, encryption of long strings fails with Array buffer allocation errors
        // have to split the string into chunks
        const arrChunks = [];
        const CHUNK_LENGTH = 2003;
        for (let offset = 0; offset < json.length; offset += CHUNK_LENGTH) {
            //	console.log('offset '+offset);
            arrChunks.push(cipher.update(json.slice(offset, Math.min(offset + CHUNK_LENGTH, json.length)), 'utf8'));
        }
        arrChunks.push(cipher.final());
        const encryptedMessageBuf = Buffer.concat(arrChunks);
        const encryptedMessage = encryptedMessageBuf.toString('base64');
        //console.log(encrypted_message);
        const authtag = cipher.getAuthTag();
        // this is visible and verifiable by the hub
        return {
            encrypted_message: encryptedMessage,
            iv: iv.toString('base64'),
            authtag: authtag.toString('base64'),
            dh: {
                sender_ephemeral_pubkey: senderEphemeralPubKey,
                recipient_ephemeral_pubkey: pubKey,
            },
        };
    }

    decryptPackage(encrypted: EncryptedPackage, pubKey: PubKey, privateKey: DevicePrivKey): any {
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(privateKey);
        const sharedSecret = deriveSharedSecret(ecdh, encrypted.dh.sender_ephemeral_pubkey);
        const iv = new Buffer(encrypted.iv, 'base64');
        const decipher = crypto.createDecipheriv('aes-128-gcm', sharedSecret, iv);
        const authtag = new Buffer(encrypted.authtag, 'base64');
        decipher.setAuthTag(authtag);
        const encBuf = new Buffer(encrypted.encrypted_message, 'base64');
        const chunks = [];
        const CHUNK_LENGTH = 4096;
        for (let offset = 0; offset < encBuf.length; offset += CHUNK_LENGTH) {
            chunks.push(decipher.update(encBuf.slice(offset, Math.min(offset + CHUNK_LENGTH, encBuf.length))));
        }
        const decrypted1 = Buffer.concat(chunks);
        const decrypted2 = decipher.final();
        const decryptedMessageBuf = Buffer.concat([decrypted1, decrypted2]);
        const decryptedMessage = decryptedMessageBuf.toString('utf8');
        const json = JSON.parse(decryptedMessage);
        if (json.encrypted_package) {
            // strip another layer of encryption
            return this.decryptPackage(json.encrypted_package, pubKey, privateKey);
        } else {
            return json;
        }
    }
}

const encrypt = new Encrypt();
export default encrypt;
