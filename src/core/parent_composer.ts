import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import * as _ from 'lodash';
import storage from '../storage/storage';
import * as mc from './main_chain';

type LastStable = {
    ball: string,
    unit: string,
    mci: number,
};

export interface IParentComposer {
    pickParentUnitsAndLastBall(witnesses: Address[]): Promise<[string[], LastStable]>;
}

class ParentComposer implements IParentComposer {
    async pickParentUnitsAndLastBall(witnesses: Address[]): Promise<[string[], LastStable]> {
        const parentUnits = await pickParentUnits(witnesses);
        const [ball, unit, mci] = await findLastStableMcBall(witnesses);
        const adjustedParentUnits = await adjustLastStableMcBallAndParents(ball, unit, witnesses);
        const trimmedParentUnits = await trimParentList(adjustedParentUnits, witnesses);
        return [trimmedParentUnits, {ball: ball, unit: unit, mci: mci}];
    }
}

const parentComposer = new ParentComposer();
export default parentComposer;


async function pickParentUnits(witnesses: Address[]) {
    // don't exclude units derived from
    // unwitnessed potentially bad units! It is not their blame and can cause a split.
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
    const parentUnits = rows.map(row => row.unit);
}

async function adjustParentsToNotRetreatWitnessedLevel(witnesses: Address[], parentUnits: Address[]) {
    let excludedUnits = [];
    let iteration = 0;

    async function replaceExcludedParent(currentParentUnits, excludedUnit) {
        const newExcludedUnits = [excludedUnit];
        excludedUnits = excludedUnits.concat(newExcludedUnits);
        const parentsToKeep = _.difference(currentParentUnits, newExcludedUnits);
        let rows = await sqlstore.all(
            'SELECT DISTINCT parent_unit FROM parenthoods WHERE child_unit IN(?)',
            newExcludedUnits,
        );
        const candidateReplacements = rows.map(row => row.parent_unit);
        rows = await sqlstore.all(
            `SELECT DISTINCT parent_unit FROM parenthoods WHERE parent_unit IN(?) AND child_unit NOT IN(?)`,
            candidateReplacements, excludedUnits,
        );

        const candidatesWithOtherChildren = rows.map(row => row.parent_unit);
        const replacementParents = _.difference(candidateReplacements, candidatesWithOtherChildren);
        const newParents = parentsToKeep.concat(replacementParents);
        return checkWitnessedLevelAndReplace(newParents);
    }

    async function checkWitnessedLevelAndReplace(currentParentUnits: string[]) {
        iteration++;

    }

}

async function determineWitnessedLevels(witnesses: Address[], parentUnits: string[]) {
    const [level, bestParent] = await storage.determineWitnessedLevelAndBestParent(parentUnits, witnesses);
    const props = await storage.readStaticUnitProps(bestParent);
    return [level, props.witnessed_level, bestParent];
}


async function findLastStableMcBall(witnesses: Address[]) {
    const rows = sqlstore.all(`
        SELECT ball, unit, main_chain_index FROM units JOIN balls USING(unit)
        WHERE is_on_main_chain=1 AND is_stable=1 AND +sequence='good' AND (
            SELECT COUNT(*)
            FROM unit_witnesses
            WHERE unit_witnesses.unit IN(units.unit, units.witness_list_unit) AND address IN(?)
        )>=?
        ORDER BY main_chain_index DESC LIMIT 1`,
        witnesses, conf.COUNT_WITNESSES - conf.MAX_WITNESS_LIST_MUTATIONS,
    );
    return [rows[0].ball, rows[0].unit, rows[0].mainChainIndex];
}

async function adjustLastStableMcBallAndParents(lastStableMcBallUnit: string, parentUnits: string[], witnesses: Address[]) {
    const isStable = await mc.determineIfStableInLaterUnits(lastStableMcBallUnit, parentUnits);
    return;
}

async function trimParentList(parentUnits: any[], witnesses: Address[]) {
    if (parentUnits.length <= conf.MAX_PARENTS_PER_UNIT)
        return parentUnits;
    const rows = await sqlstore.all(`
        SELECT unit, (SELECT 1 FROM unit_authors WHERE unit_authors.unit=units.unit AND address IN(?) LIMIT 1) AS is_witness
        FROM units WHERE unit IN("+arrParentUnits.map(db.escape).join(', ')+") ORDER BY is_witness DESC, "+db.getRandom()+" LIMIT ?`,
        witnesses, conf.MAX_PARENTS_PER_UNIT,
    );
    return rows.map(row => row.unit).sort();
}
