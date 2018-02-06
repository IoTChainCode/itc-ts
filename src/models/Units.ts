import Unit from '../core/unit';
import sqlstore from '../storage/sqlstore';
import Parents from './Parents';
import Witnesses from './Witnesses';
import {Authors} from './Authors';
import Messages from './Messages';
import {isGenesisUnit} from '../core/genesis';

type StaticUnitProps = {
    level: number,
    witnessed_level: number,
    best_parent_unit: Base64,
    witness_list_unit: Base64,
};

const cachedUnits = new Map<Base64, StaticUnitProps>();
const stableUnits = new Map<Base64, any>();


type UnitStatus = 'unknown' | 'known';

export default class Units {
    static async readStaticUnitProps(unit: Base64): Promise<StaticUnitProps> {
        const props = cachedUnits.get(unit);
        if (props)
            return props;

        const row: StaticUnitProps = await sqlstore.get(`
            SELECT level, witnessed_level, best_parent_unit, witness_list_unit FROM units where unit=?`, unit);
        cachedUnits.set(unit, row);
        return row;
    }

    static async readUnitProps(unit: Base64): Promise<any> {
        if (stableUnits.has(unit))
            return stableUnits.get(unit);

        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain, is_free, is_stable, witnessed_level
            FROM units WHERE unit=?`,
            unit,
        );
        const props = rows[0];
        if (props.is_stable) {
            stableUnits.set(unit, props);
        }

        return props;
    }

    static async readPropsOfUnits(earlierUnit: string, laterUnits: any[]) {
        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain, is_free FROM units WHERE unit IN(?, ?)`,
            earlierUnit, laterUnits,
        );
        let earlierUnitProps;
        const laterUnitProps = [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].unit === earlierUnit)
                earlierUnitProps = rows[i];
            else
                laterUnitProps.push(rows[i]);
        }
        return [earlierUnitProps, laterUnitProps];
    }

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
        let witnesses = [];
        if (!row.witness_list_unit) {
            witnesses = await Witnesses.readWitnessList(unit);
        }
        const authors = await Authors.read(unit);
        const messages = await Messages.read(unit);
        return new Unit(
            parents,
            row.last_ball,
            row.last_ball_unit,
            row.witness_list_unit,
            authors,
            witnesses,
            messages,
        );
    }

    static async save(unit: Unit, sequence: string) {
        const fields = [
            'unit', 'version', 'alt', 'witness_list_unit', 'last_ball_unit', 'headers_commission',
            'payload_commission', 'sequence', 'content_hash',
        ];
        const values = '?,?,?,?,?,?,?,?,?';
        const params = [unit.unit, unit.version, unit.alt, unit.witnessListUnit, unit.lastBallUnit, unit.headersCommission,
            unit.payloadCommission, sequence,
        ];

        await sqlstore.run(`INSERT INTO units (${fields}) VALUES (${values})`, ...params);

        if (isGenesisUnit(unit)) {
            await sqlstore.run(`
            UPDATE units SET is_on_main_chain=1, main_chain_index=0, is_stable=1, level=0, witnessed_level=0
            WHERE unit=?`, unit.unit);
        } else {
            await sqlstore.run(`UPDATE units SET is_free=0 WHERE unit IN(?)`, unit.parentUnits);
        }

        // save balls
        if (unit.ball) {
            await sqlstore.run('INSERT INTO balls (ball, unit) VALUES(?,?)', unit.ball, unit.unit);
        }
        // save parenthoods
        if (unit.parentUnits) {
            for (const parent of unit.parentUnits) {
                await sqlstore.run('INSERT INTO parenthoods (child_unit, parent_unit) VALUES(?,?)', unit.unit, parent);
            }
        }
        await Messages.save(unit);
        await Witnesses.save(unit);
        await Authors.save(unit);
    }

    static async checkUnitStatus(unit: Base64): Promise<UnitStatus> {
        const rows = await sqlstore.all('SELECT 1 FROM units WHERE unit=?', unit);
        if (rows.length > 0)
            return 'known';

        return 'unknown';
    }
}
