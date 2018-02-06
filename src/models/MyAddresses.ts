import sqlstore from '../storage/sqlstore';
import XPubKeys from './XPubKeys';
import * as objectHash from '../common/object_hash';
import HDKeys from '../common/HDKeys';
import Definition from '../core/definition';

export type MyAddress = {
    address: Address,
    wallet: Base64,
    is_change: number,
    address_index: number,
    definition: string,
};

export default class MyAddresses {
    static async read(): Promise<MyAddress[]> {
        return sqlstore.all('select * from my_addresses');
    }

    static async deriveAddress(wallet: Base64, isChange: number, addressIndex: number) {
        const row = await sqlstore.get(`
            SELECT definition_template, full_approval_date FROM wallets WHERE wallet=?`,
            wallet,
        );

        if (!row) {
            throw Error('wallet not found: ' + wallet + ', is_change=' + isChange + ', index=' + addressIndex);
        }

        let definitions = JSON.parse(row.definition_template);
        const pk = await XPubKeys.findByWallet(wallet);
        const params: any = {};
        params[`pubkey@${pk.device_address}`] = HDKeys.derivePubKey(pk.extended_pubkey, isChange, addressIndex);
        const address = objectHash.getChash160(definitions);
        definitions = Definition.replaceTemplate(definitions, params);
        return [address, definitions];
    }

    static async readNextAddressIndex(wallet: Base64, isChange: number) {
        const row = await sqlstore.get(`
            SELECT MAX(address_index) AS last_used_index 
            FROM my_addresses WHERE wallet=? AND is_change=?`,
            wallet, isChange,
        );
        const index = row.last_used_index;
        if (row === null) {
            return 0;
        } else {
            return index + 1;
        }
    }

    static async readLastUsedAddressIndex(wallet: Base64, isChange: number) {
        const row = await sqlstore.get(`
            SELECT MAX(address_index) AS last_used_index 
            FROM my_addresses JOIN outputs USING(address) WHERE wallet=? AND is_change=?`,
            wallet, isChange,
        );

        return row.last_used_index;
    }

    static async issueOrSelectNextAddress(wallet: Base64, isChange: number = 0): Promise<Address> {
        const addressIndex = await MyAddresses.readNextAddressIndex(wallet, isChange);
        return this.issueAddress(wallet, isChange, addressIndex);
    }

    static async issueOrSelectNextChangeAddress(wallet: Base64) {
        return this.issueOrSelectNextAddress(wallet, 1);
    }

    static async issueAddress(wallet: Base64, isChange: number, addressIndex: number): Promise<Address> {
        const [address, definitions] = await this.deriveAddress(wallet, isChange, addressIndex);
        await this.save(address, wallet, isChange, addressIndex, definitions);
        return address;
    }

    static async save(address: Address, wallet: Base64, isChange: number, addressIndex: number, definition: any[]) {
        await sqlstore.run(`
            INSERT INTO my_addresses (address, wallet, is_change, address_index, definition) VALUES (?,?,?,?,?)`,
            address, wallet, isChange, addressIndex, JSON.stringify(definition),
        );
    }
}
