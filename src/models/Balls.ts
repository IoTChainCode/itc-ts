import sqlstore from '../storage/sqlstore';
import Unit from '../core/unit';

export default class Balls {
    static async read(unit: Base64): Promise<Base64> {
        const row = await sqlstore.get('SELECT ball FROM balls WHERE unit=?', [unit]);
        return row.ball;
    }

    static async save(unit: Unit) {
        if (unit.ball) {
            await sqlstore.run(`INSERT INTO balls (ball, unit) VALUES (?,?)`, [unit.ball, unit.unit]);
            await sqlstore.run(`DELETE FROM hash_tree_balls WHERE ball=? AND unit=?`, [unit.ball, unit.unit]);
        }
    }
}
