import Unit from '../core/unit';
import sqlstore from '../storage/sqlstore';

export default class Parents {
    static async read(unit: Base64): Promise<Base64[]> {
        const rows = await sqlstore.all(`
        SELECT parent_unit
        FROM parenthoods
        WHERE child_unit=?
        ORDER BY parent_unit`,
            [unit],
        );

        return rows.map(row => row.parent_unit);
    }

    static async save(unit: Unit): Promise<void> {
        if (unit.parentUnits) {
            for (const parent of unit.parentUnits) {
                await sqlstore.run(`INSERT INTO parenthoods (child_unit, parent_unit) VALUES (?,?)`, [unit.unit, parent]);
            }
        }
    }
}
