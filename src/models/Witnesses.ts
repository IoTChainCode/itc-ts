import sqlstore from '../storage/sqlstore';
import Unit from '../core/unit';
import * as objectHash from '../common/object_hash';
import * as conf from '../common/conf';
import Base64 = require('crypto-js/enc-base64');

const cachedWitnesses = new Map<Base64, Address[]>();

export default class Witnesses {
    static async findWitnessListUnit(witnesses: Address[], lbMCI: number): Promise<Base64> {
        const rows = await sqlstore.all(`
            SELECT witness_list_hashes.witness_list_unit
            FROM witness_list_hashes CROSS JOIN units ON witness_list_hashes.witness_list_unit=unit
            WHERE witness_list_hash=? AND sequence='good' AND is_stable=1 AND main_chain_index<=?`,
            [objectHash.getObjHashB64(witnesses), lbMCI],
        );
        return rows[0].witness_list_unit;
    }

    static async readWitnesses(unit: Base64): Promise<Address[]> {
        const witnesses = cachedWitnesses.get(unit);
        if (witnesses)
            return witnesses;
        const rows = await sqlstore.all('SELECT witness_list_unit FROM units WHERE unit=?', unit);
        if (rows.length === 0)
            throw Error('unit ' + unit + ' not found');

        const witnessListUnit = rows[0].witness_list_unit;
        return Witnesses.readWitnessList(witnessListUnit ? witnessListUnit : unit);
    }

    static async readWitnessList(unit: Base64): Promise<Address[]> {
        let witnesses = cachedWitnesses.get(unit);
        if (witnesses)
            return witnesses;
        const rows = await sqlstore.all(`
            SELECT address FROM unit_witnesses WHERE unit=? ORDER BY address`,
            unit,
        );
        if (rows.length === 0)
            throw Error('witness list of unit ' + unit + ' not found');
        if (rows.length > 0 && rows.length !== conf.COUNT_WITNESSES)
            throw Error('wrong number of witnesses in unit ' + unit);
        witnesses = rows.map(row => row.address);
        cachedWitnesses[unit] = witnesses;
        return witnesses;
    }

    static async save(unit: Unit): Promise<void> {
        for (const witness of unit.witnesses) {
            await sqlstore.run(`INSERT INTO unit_witnesses (unit, address) VALUES (?,?)`, [unit.unit, witness]);
        }
        await sqlstore.run('INSERT INTO witness_list_hashes (witness_list_unit, witness_list_hash) VALUES (?,?)',
            [unit.unit, objectHash.getObjHashB64(unit.witnesses)]);
    }
}
