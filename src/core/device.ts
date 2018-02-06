import logger from '../common/log';
import sqlstore from '../storage/sqlstore';
import signature from '../common/Signature';
import * as hash from '../common/hash';
import encrypt from '../common/encrypt';
import * as address from '../common/address';
import * as crypto from 'crypto';
import * as secp256k1 from 'secp256k1';
import * as objectHash from '../common/object_hash';
import WebSocketClient from '../network/WebSocketClient';
import network from '../network/Peer';

type TempPubKey = {
    tempPubKey: PubKey;
    pubKey: PubKey;
    signature: Base64;
};

export class Device {
    private _permanentPrivateKey: DevicePrivKey;
    private _permanentPubKey: PubKey;
    private _ephemeralPrivateKey: DevicePrivKey;
    private _ephemeralPubKey: PubKey;
    private _deviceAddress: Address;
    private _deviceName: string;
    private _deviceHub: string;

    constructor(privateKey?: DevicePrivKey) {
        if (!privateKey) {
            privateKey = this.genPrivateKey();
        }
        this._permanentPrivateKey = privateKey;
        this._permanentPubKey = secp256k1.publicKeyCreate(privateKey, true).toString('base64');
        this._deviceAddress = address.deriveAddress(this._permanentPubKey);
    }

    permanentPrivateKey(): DevicePrivKey {
        return this._permanentPrivateKey;
    }

    permanentPubKey(): PubKey {
        return this._permanentPubKey;
    }

    ephemeralPrivateKey(): DevicePrivKey {
        return this._ephemeralPrivateKey;
    }

    ephemeralPubKey(): PubKey {
        return this._ephemeralPubKey;
    }

    deviceAddress(): Address {
        return this._deviceAddress;
    }

    deviceName(): string {
        return this._deviceName;
    }

    deviceHub(): string {
        return this._deviceHub;
    }

    genPrivateKey(): DevicePrivKey {
        let privKey;
        do {
            privKey = crypto.randomBytes(32);
        }
        while (!secp256k1.privateKeyVerify(privKey));
        return privKey;
    }

    async sendMessageToDevice(to: Address, subject: string, body: any) {
        const rows = await sqlstore.all(
            'SELECT hub, pubkey FROM correspondent_devices WHERE device_address=?',
            [to],
        );
        if (rows.length !== 1) {
            throw new Error('correspondent not found');
        }
        return this.sendMessageToHub(rows[0].hub, rows[0].pubkey, subject, body);
    }

    async sendMessageToHub(ws: WebSocketClient | string | null, recipientPubkey: PubKey, subject: any, body: any): Promise<any> {
        const obj = {
            from: this.deviceAddress,
            device_hub: this.deviceHub,
            subject: subject,
            body: body,
        };

        if (ws) {
            return this._reliablySendPreparedMessageToHub(ws, recipientPubkey, obj);
        }
        // derive address based on pubkey
        const to = address.deriveAddress(recipientPubkey);
        const rows = await sqlstore.all(`SELECT hub FROM correspondent_devices where device_address=?`, [to]);
        if (rows.length !== 1) {
            throw new Error('no hub in correspondents');
        }
        return this._reliablySendPreparedMessageToHub(rows[0].hub, recipientPubkey, obj);
    }

    async _reliablySendPreparedMessageToHub(ws: WebSocketClient | string, recipientPubKey: PubKey, obj: any) {
        const to = address.deriveAddress(recipientPubKey);
        logger.info(`will encrypt and send to ${to}: ${obj}`);
        const encryptedMessage = encrypt.encryptMessage(obj, recipientPubKey);
        const message = {
            encrypted_package: encryptedMessage,
        };
        const messageHash = objectHash.getObjHashB64(message);
        await sqlstore.run(
            `INSERT INTO outbox (message_hash, to_address, message) VALUES(?,?,?)`,
            [messageHash, to, JSON.stringify(message)],
        );
        return this._sendPreparedMessageToHub(ws, recipientPubKey, messageHash, obj);
    }

    async _sendPreparedMessageToHub(ws: WebSocketClient | string, recipientPubKey: PubKey, messageHash: Base64, json: string) {
        if (typeof ws === 'string') {
            ws = await network.getOrCreateClient(ws);
        }
        let resp: TempPubKey;
        try {
            resp = await network.sendRequest(ws, 'hub/get_temp_pubkey', recipientPubKey);
        } catch (e) {
            return await sqlstore.run(`UPDATE outbox SET last_error=? WHERE message=?`, [e, messageHash]);
        }

        if (!resp.tempPubKey || !resp.pubKey || !resp.signature) {
            throw new Error('missing fields in hub response');
        }

        if (resp.pubKey !== recipientPubKey) {
            throw new Error('temp pubkey signed by wrong permanent pubkey');
        }

        if (!signature.verifySigned(resp, resp.signature)) {
            throw new Error('wrong sig under temp pubkey');
        }

        const encryptedMessage = encrypt.encryptMessage(json, recipientPubKey);
        const to = address.deriveAddress(recipientPubKey);

        const content: any = {
            encrypted_package: encryptedMessage,
            to: to,
            pubkey: this.permanentPubKey,
        };

        content.signature = signature.sign(hash.sha256B64(content), this.permanentPrivateKey());

        const response = await network.sendRequest(ws, 'hub/deliver', content);
        if (response === 'accepted') {
            return await sqlstore.run(`DELETE FROM outbox WHERE message_hash=?`, [messageHash]);
        } else {
            throw (response.error || new Error(`unrecognized response: ${response}`));
        }
    }

    async sendPairingMessage(hub: string, recipientPubKey: PubKey, pairingSecret: string, reversePairingSecret: string) {
        const body: any = {pairing_secret: pairingSecret, device_name: this.deviceName()};
        if (reversePairingSecret)
            body.reverse_pairing_secret = reversePairingSecret;
        return this.sendMessageToHub(hub, recipientPubKey, 'pairing', body);
    }
}

const device = new Device();
export default device;

