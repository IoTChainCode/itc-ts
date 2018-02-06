import sqlstore from '../storage/sqlstore';

export type XPubKey = {
    extended_pubkey: PubKey,
    device_address: DeviceAddress,
};

export default class XPubKeys {
    static async all() {
        return sqlstore.all(`select * from extended_pubkeys`);
    }

    static async findByWallet(wallet: Base64): Promise<XPubKey> {
        return sqlstore.get(`select extended_pubkey, device_address from extended_pubkeys where wallet=?`, wallet);
    }

    static async findByDeviceAddress(devAdd: DeviceAddress) {
        return sqlstore.get(`select * from extended_pubkeys where device_address=?`, devAdd);
    }
}
