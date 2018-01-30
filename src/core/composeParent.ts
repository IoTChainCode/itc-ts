import sqlstore, {SqliteStore} from '../storage/sqlstore';
import * as conf from '../common/conf';

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
        LEFT JOIN archived_joints USING(unit)
        WHERE +sequence='good' AND is_free=1 AND archived_joints.unit IS NULL ORDER BY unit LIMIT ?`,
        witnesses, conf.MAX_PARENTS_PER_UNIT,
    );
    return rows.map(row => row.unit);
}

async function findLastStableMcBall(witnesses: Address[]): Promise<LastStable> {
    const row = await sqlstore.get(`
        SELECT ball, unit, main_chain_index FROM units JOIN balls USING(unit)
        WHERE is_on_main_chain=1 AND is_stable=1 AND +sequence='good' AND (
            SELECT COUNT(*)
            FROM unit_witnesses
            WHERE unit_witnesses.unit IN(units.unit, units.witness_list_unit) AND address IN(?)
        )>=?
        ORDER BY main_chain_index DESC LIMIT 1`,
        witnesses, conf.COUNT_WITNESSES - conf.MAX_WITNESS_LIST_MUTATIONS,
    );

    return {
        ball: row.ball,
        unit: row.unit,
        mci: row.main_chain_index,
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

export default async function composeParent(witnesses: Address[], isGenesis: boolean = false): Promise<[Base64[], LastStable]> {
    if (isGenesis) {
        return [[], {ball: null, unit: null, mci: 0}];
    }

    const parents = await pickParentUnits(witnesses);
    const lastStable = await findLastStableMcBall(witnesses);
    const trimmed = await trimParentList(parents, witnesses);
    return [trimmed, lastStable];
}
