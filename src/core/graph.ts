import sqlstore from '../storage/sqlstore';
import * as assert from 'assert';
import * as genesis from '../core/genesis';
import * as _ from 'lodash';

export async function compareUnits(unit1: Base64, unit2: Base64) {
    if (unit1 === unit2)
        return 0;
    const rows = await sqlstore.all(
        'SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain, is_free FROM units WHERE unit IN(?)',
        [unit1, unit2],
    );
    assert(rows.length === 2);
    const unitProps1 = (rows[0].unit === unit1) ? rows[0] : rows[1];
    const unitProps2 = (rows[0].unit === unit2) ? rows[0] : rows[1];
    return compareUnitsByProps(unitProps1, unitProps2);
}

export async function compareUnitsByProps(unitProps1: any, unitProps2: any) {
    if (unitProps1.unit === unitProps2.unit)
        return 0;
    if (unitProps1.level === unitProps2.level)
        return null;
    if (unitProps1.is_free === 1 && unitProps2.is_free === 1) // free units
        return null;

    // genesis
    if (unitProps1.latest_included_mc_index === null)
        return -1;
    if (unitProps2.latest_included_mc_index === null)
        return +1;

    if (unitProps1.latest_included_mc_index >= unitProps2.main_chain_index && unitProps2.main_chain_index !== null)
        return +1;
    if (unitProps2.latest_included_mc_index >= unitProps1.main_chain_index && unitProps1.main_chain_index !== null)
        return -1;

    if (unitProps1.level <= unitProps2.level
        && unitProps1.latest_included_mc_index <= unitProps2.latest_included_mc_index
        && (unitProps1.main_chain_index <= unitProps2.main_chain_index
            && unitProps1.main_chain_index !== null && unitProps2.main_chain_index !== null
            || unitProps1.main_chain_index === null || unitProps2.main_chain_index === null)
        ||
        unitProps1.level >= unitProps2.level
        && unitProps1.latest_included_mc_index >= unitProps2.latest_included_mc_index
        && (unitProps1.main_chain_index >= unitProps2.main_chain_index
            && unitProps1.main_chain_index !== null && unitProps2.main_chain_index !== null
            || unitProps1.main_chain_index === null || unitProps2.main_chain_index === null)
    ) {
        // still can be comparable
    } else
        return null;

    const earlierUnit = (unitProps1.level < unitProps2.level) ? unitProps1 : unitProps2;
    const laterUnit = (unitProps1.level < unitProps2.level) ? unitProps2 : unitProps1;
    const resultIfFound = (unitProps1.level < unitProps2.level) ? -1 : 1;

    // can be negative if main_chain_index === null but that doesn't matter
    const earlierUnitDelta = earlierUnit.main_chain_index - earlierUnit.latest_included_mc_index;
    const laterUnitDelta = laterUnit.main_chain_index - laterUnit.latest_included_mc_index;

    async function goUp(startUnits) {
        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain
            FROM parenthoods JOIN units ON parent_unit=unit
            WHERE child_unit IN(?)`,
            startUnits,
        );
        const newStartUnits = [];
        for (let i = 0; i < rows.length; i++) {
            const unitProps = rows[i];
            if (unitProps.unit === earlierUnit.unit)
                return resultIfFound;
            if (unitProps.is_on_main_chain === 0 && unitProps.level > earlierUnit.level)
                newStartUnits.push(unitProps.unit);
        }
        if (newStartUnits.length > 0) {
            return goUp(startUnits);
        } else {
            return null;
        }
    }

    async function goDown(startUnits) {
        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain
            FROM parenthoods JOIN units ON child_unit=unit
            WHERE parent_unit IN(?)`,
            startUnits,
        );
        const newStartUnits = [];
        for (let i = 0; i < rows.length; i++) {
            const unitProps = rows[i];
            if (unitProps.unit === laterUnit.unit)
                return resultIfFound;
            if (unitProps.is_on_main_chain === 0 && unitProps.level < laterUnit.level)
                newStartUnits.push(unitProps.unit);
        }
        if (newStartUnits.length > 0) {
            return goDown(newStartUnits);
        } else {
            return null;
        }
    }

    if (laterUnitDelta > earlierUnitDelta) {
        return goUp([laterUnit.unit]);
    } else {
        return goDown([earlierUnit.unite]);
    }
}

/**
 * determines if earlierUnit is included by at least one of LaterUnits
 */
export async function determineIfIncluded(earlierUnit: Base64, laterUnits: Base64[]) {
    if (await genesis.isGenesisUnit(earlierUnit))
        return true;

    const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain, is_free FROM units WHERE unit IN(?, ?)`,
        [earlierUnit, laterUnits],
    );
    let earlierUnitProps;
    const laterUnitProps = [];
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].unit === earlierUnit)
            earlierUnitProps = rows[i];
        else
            laterUnitProps.push(rows[i]);
    }

    if (earlierUnitProps.is_free === 1)
        return false;

    const maxLaterLimci = Math.max.apply(null, laterUnitProps.map(p => p.latest_included_mc_index));
    if (earlierUnitProps.main_chain_index !== null && maxLaterLimci >= earlierUnitProps.main_chain_index) {
        return true;
    }

    const maxLaterLevel = Math.max.apply(null, laterUnitProps.map(p => p.level));

    if (maxLaterLevel < earlierUnitProps.level)
        return false;

    async function goUp(startUnits) {
        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain
            FROM parenthoods JOIN units ON parent_unit=unit
            WHERE child_unit IN(?)`,
            startUnits,
        );

        const newStartUnits = [];
        for (let i = 0; i < rows.length; i++) {
            const unitProps = rows[i];
            if (unitProps.unit === earlierUnit)
                return true;
            if (unitProps.is_on_main_chain === 0 && unitProps.level > earlierUnitProps.level)
                newStartUnits.push(unitProps.unit);
        }
        if (newStartUnits.length > 0) {
            return goUp(_.uniq(newStartUnits));
        } else {
            return false;
        }
    }

    return goUp(laterUnits);
}

export async function determineIfIncludedOrEqual(earlierUnit: Base64, laterUnits: Base64[]) {
    if (laterUnits.indexOf(earlierUnit) >= 0)
        return true;
    return determineIfIncluded(earlierUnit, laterUnits);
}
