import sqlstore, {SqliteStore} from '../storage/sqlstore';
import * as conf from '../common/conf';
import logger from '../common/log';
import Units from '../models/Units';

type LastStable = {
    ball: string,
    unit: string,
    mci: number,
};

async function pickParentUnits(witnesses: Base64[]) {
    const rows = await sqlstore.all(`
        SELECT unit, version, alt, (
            SELECT count(*) FROM unit_witnesses 
            WHERE unit_witnesses.unit IN(units.unit, units.witness_list_unit) AND
            address IN(?)
        ) AS count_matching_witnesses
        FROM units
        WHERE +sequence='good' AND is_free=1 ORDER BY unit LIMIT ?`,
        witnesses, conf.MAX_PARENTS_PER_UNIT,
    );
    return rows.map(row => row.unit);
}

async function findLastStableMcBall(witnesses: Address[]): Promise<LastStable> {
    const rows = await sqlstore.all(`
        SELECT ball, unit, main_chain_index FROM units JOIN balls USING(unit)
        WHERE is_on_main_chain=1 AND is_stable=1 AND +sequence='good' AND (
            SELECT COUNT(*)
            FROM unit_witnesses
            WHERE unit_witnesses.unit IN(units.unit, units.witness_list_unit)
        )>=?
        ORDER BY main_chain_index DESC LIMIT 1`,
        conf.COUNT_WITNESSES - conf.MAX_WITNESS_LIST_MUTATIONS,
    );

    return {
        ball: rows[0].ball,
        unit: rows[0].unit,
        mci: rows[0].main_chain_index,
    };
}

async function trimParentList(parentUnits: Base64[], witnesses: Address[]): Promise<Base64[]> {
    if (parentUnits.length <= conf.MAX_PARENTS_PER_UNIT)
        return parentUnits;

    const rows = await sqlstore.all(`
        SELECT unit, (SELECT 1 FROM unit_authors WHERE unit_authors.unit=units.unit AND address IN(?) LIMIT 1) AS is_witness
        FROM units WHERE unit IN(${parentUnits.map(SqliteStore.escape).join(',')}) ORDER BY is_witness DESC, RANDOM() LIMIT ?`,
        witnesses, conf.MAX_PARENTS_PER_UNIT,
    );
    return rows.map(row => row.unit).sort();
}

export default async function composeParent(witnesses: Address[]): Promise<[Base64[], LastStable]> {
    const parents = await pickParentUnits(witnesses);
    logger.info({parents}, 'pickParentUnits');
    const lastStable = await findLastStableMcBall(witnesses);
    logger.info({lastStable}, 'findLastStableMcBall');
    const trimmed = await trimParentList(parents, witnesses);
    return [trimmed, lastStable];
}
