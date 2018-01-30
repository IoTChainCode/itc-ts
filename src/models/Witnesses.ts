import sqlstore from '../storage/sqlstore';
import Unit from '../core/unit';
import * as objectHash from '../common/object_hash';

export default class Witnesses {
    static async read(unit: Base64): Promise<Address[]> {
        const rows = await sqlstore.all(
            'SELECT address FROM unit_witnesses WHERE unit=? ORDER BY address',
            [unit],
        );
        return rows.map(row => row.address);
    }

    static async save(unit: Unit): Promise<void> {
        for (const witness of unit.witnesses) {
            await sqlstore.run(`INSERT INTO unit_witnesses (unit, address) VALUES (?,?)`, [unit.unit, witness]);
        }
        await sqlstore.run('INSERT INTO witness_list_hashes (witness_list_unit, witness_list_hash) VALUES (?,?)',
            [unit.unit, objectHash.getObjHashB64(unit.witnesses)]);
    }
}
