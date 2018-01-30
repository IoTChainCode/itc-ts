import Unit from '../core/unit';
import sqlstore from '../storage/sqlstore';
import storage from '../storage/storage';
import Parents from './Parents';
import Witnesses from './Witnesses';
import {Authors} from './Authors';
import Messages from './Messages';
import Balls from './Balls';

export default class Units {

    static async read(unit: Base64): Promise<Unit> {
        const row = await sqlstore.get(`
            SELECT units.unit, version, alt, witness_list_unit, last_ball_unit, balls.ball AS last_ball, is_stable,
            content_hash, headers_commission, payload_commission, main_chain_index,
            FROM units LEFT JOIN balls ON last_ball_unit=balls.unit WHERE units.unit=?`,
            unit,
        );

        if (!row) {
            return null;
        }

        const parents = await Parents.read(unit);
        const ball = await Balls.read(unit);
        let witnesses = [];
        if (!row.witness_list_unit) {
            witnesses = await Witnesses.read(unit);
        }
        const authors = await Authors.read(unit);
        const messages = await Messages.read(unit);
        return new Unit(
            row.version,
            row.alt,
            parents,
            row.last_ball,
            row.last_ball_unit,
            row.witness_list_unit,
            authors,
            witnesses,
            messages,
        );
    }

    static async save(unit: Unit, sequence: string, isGenesis: boolean = false) {
        const fields = [
            'unit', 'version', 'alt', 'witness_list_unit', 'last_ball_unit', 'headers_commission',
            'payload_commission', 'sequence', 'content_hash',
        ];
        const values = '?,?,?,?,?,?,?,?,?';
        const params = [unit.unit, unit.version, unit.alt, unit.witnessListUnit, unit.lastBallUnit, unit.headersCommission,
            unit.payloadCommission, sequence, unit.contentHash,
        ];

        await sqlstore.run(`INSERT INTO units (${fields}) VALUES (${values})`, params);

        if (isGenesis) {
            await sqlstore.run(`
            UPDATE units SET is_on_main_chain=1, main_chain_index=0, is_stable=1, level=0, witnessed_level=0
            WHERE unit=?`, [unit.unit]);
        } else {
            await sqlstore.run(`UPDATE units SET is_free=0 WHERE unit IN(?)`, [unit.parentUnits]);
            unit.parentUnits.forEach((parent) => {
                if (storage.unstableUnits[parent])
                    storage.unstableUnits[parent].isFree = 0;
            });
        }
    }
}
