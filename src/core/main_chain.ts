import sqlstore from '../storage/sqlstore';
import * as _ from 'lodash';
import * as genesis from '../core/genesis';
import * as hcom from '../core/headers_commission';
import * as pcom from '../core/payload_commission';
import * as objectHash from '../common/object_hash';
import * as conf from '../common/conf';
import Units from '../models/Units';
import Witnesses from '../models/Witnesses';

export async function determineIfStableInLaterUnits(earlierUnit: string, laterUnits: any[]) {
    const [earlierUnitProps, laterUnitProps] = await Units.readPropsOfUnits(earlierUnit, laterUnits);
    if (earlierUnitProps.is_free === 1)
        return false;
    return true;
}

export async function updateMainChain(fromUnit: Base64, lastAddedUnit: Base64) {
    const allParents = [];
    const newMcUnits = [];

    return goUpFromUnit(fromUnit);

    async function goUpFromUnit(unit: Base64) {
        if (genesis.isGenesisUnit(unit)) {
            // reached genesis
            return checkNotRebuildingStableMainChainAndGoDown(0, unit);
        }

        let unitProps;
        if (unit === null) {
            const rows = await sqlstore.all(`
                SELECT unit AS best_parent_unit, witnessed_level 
                FROM units WHERE is_free=1 
                ORDER BY witnessed_level DESC, 
                level-witnessed_level ASC, 
                unit ASC 
                LIMIT 5`);
            if (rows.length === 0) {
                throw Error('no free units');
            }
            unitProps = rows[0];
        } else {
            unitProps = await Units.readStaticUnitProps(unit);
        }

        const bestParentUnit = unitProps.best_parent_unit;
        const bestParentProps = await Units.readUnitProps(bestParentUnit);

        if (!bestParentProps.is_on_main_chain) {
            await sqlstore.run('UPDATE units SET is_on_main_chain=1, main_chain_index=NULL WHERE unit=?', bestParentUnit);
            bestParentProps.in_on_main_chain = 1;
            bestParentProps.main_chain_index = null;
            newMcUnits.push(bestParentUnit);
            return goUpFromUnit(bestParentUnit);
        } else {
            if (unit === null) {
                return updateLatestIncludedMcIndex(bestParentProps.main_chain_index, false);
            } else {
                return checkNotRebuildingStableMainChainAndGoDown(bestParentProps.main_chain_index, bestParentUnit);
            }
        }
    }

    async function checkNotRebuildingStableMainChainAndGoDown(lastMCI: number, lastMCU: Base64) {
        const rows = await sqlstore.all(
            'SELECT unit FROM units WHERE is_on_main_chain=1 AND main_chain_index>? AND is_stable=1',
            [lastMCI],
        );
        if (rows.length > 0) {
            throw Error('remove stable units');
        }
        return goDownAndUpdateMainChainIndex(lastMCI, lastMCU);
    }

    async function goDownAndUpdateMainChainIndex(lastMCI: number, lastMCU: Base64) {
        // reset
        await sqlstore.run(
            'UPDATE units SET is_on_main_chain=0, main_chain_index=NULL WHERE main_chain_index>?',
            lastMCI,
        );

        let mci = lastMCI;

        const rows = await sqlstore.all(`
            SELECT unit FROM units WHERE is_on_main_chain=1 AND
            main_chain_index IS NULL ORDER by level`);

        if (rows.length === 0) {
            throw Error('no unindexed MC units after adding');
        }

        const dbNewMcUnits = rows.map(row => row.unit);
        newMcUnits.reverse();
        if (!_.isEqual(newMcUnits, dbNewMcUnits))
            throw Error('different new MC units');

        for (const row of rows) {
            mci++;
            let units = [row.unit];
            await goUp(units);

            async function goUp(startUnits: Base64[]) {
                const rows = await sqlstore.all(`
                    SELECT DISTINCT unit
                    FROM parenthoods JOIN units ON parent_unit=unit
                    WHERE child_unit IN(?) AND main_chain_index IS NULL`,
                    startUnits,
                );
                const newStartUnits = rows.map(row => row.unit);
                if (newStartUnits.length === 0)
                    return updateMC();
                units = units.concat(newStartUnits);
                return goUp(newStartUnits);
            }

            async function updateMC() {
                await sqlstore.run(`UPDATE units SET main_chain_index=? WHERE unit IN(?)`, mci, units);
                await sqlstore.run('UPDATE unit_authors SET _mci=? WHERE unit IN(?)', mci, units);
            }
        }

        await sqlstore.all(
            'UPDATE unit_authors SET _mci=NULL WHERE unit IN(SELECT unit FROM units WHERE main_chain_index IS NULL)');
    }

    async function updateLatestIncludedMcIndex(lastMCI: number, rebuiltMc: boolean) {
        const changedUnits = {};
        const limcisByUnit = {};
        const dbLimcisByUnit = {};

        await calcLIMCIs();
        await sqlstore.run(
            'UPDATE units SET latest_included_mc_index=NULL WHERE main_chain_index>? OR main_chain_index IS NULL',
            lastMCI);

        const rows = await sqlstore.all(`
                SELECT chunits.unit, punits.main_chain_index
                FROM units AS punits
                JOIN parenthoods ON punits.unit=parent_unit
                JOIN units AS chunits ON child_unit=chunits.unit
                WHERE punits.is_on_main_chain=1
                    AND (chunits.main_chain_index > ? OR chunits.main_chain_index IS NULL)
                    AND chunits.latest_included_mc_index IS NULL`,
            [lastMCI],
        );

        for (const row of rows) {
            dbLimcisByUnit[row.unit] = row.main_chain_index;
            await sqlstore.run(
                'UPDATE units SET latest_included_mc_index=? WHERE unit=?',
                row.main_chain_index, row.unit,
            );
        }

        return propagateLIMCI();

        async function calcLIMCIs() {
            const filledUnits = [];
            for (const unit in changedUnits) {
                const props = changedUnits[unit];
                let maxlimci = -1;
                for (const parentUnit of props.parent_units) {
                    const parentUnitProps = await Units.readUnitProps(parentUnit);
                    if (parentUnitProps.is_on_main_chain) {
                        props.latest_included_mc_index = parentUnitProps.main_chain_index;
                        limcisByUnit[unit] = props.latest_included_mc_index;
                        filledUnits.push(unit);
                        break;
                    }
                    if (parentUnitProps.latest_included_mc_index > maxlimci)
                        maxlimci = parentUnitProps.latest_included_mc_index;
                }
                if (maxlimci < 0)
                    throw Error('max limci < 0 for unit ' + unit);
                props.latest_included_mc_index = maxlimci;
                limcisByUnit[unit] = props.latest_included_mc_index;
                filledUnits.push(unit);
            }

            filledUnits.forEach(function (unit) {
                delete changedUnits[unit];
            });
            if (Object.keys(changedUnits).length > 0)
                return calcLIMCIs();
        }

        async function checkAllLatestIncludedMcIndexesAreSet() {
            const rows = await sqlstore.all('SELECT unit FROM units WHERE latest_included_mc_index IS NULL AND level!=0');
            if (rows.length > 0)
                throw Error(rows.length + ' units have latest_included_mc_index=NULL, e.g. unit ' + rows[0].unit);
            return await updateStableMcFlag();
        }

        async function propagateLIMCI() {
            const rows = await sqlstore.all(`
                SELECT punits.latest_included_mc_index, chunits.unit
                FROM units AS punits
                JOIN parenthoods ON punits.unit=parent_unit
                JOIN units AS chunits ON child_unit=chunits.unit
                WHERE (chunits.main_chain_index > ? OR chunits.main_chain_index IS NULL)
                    AND (chunits.latest_included_mc_index IS NULL OR chunits.latest_included_mc_index < punits.latest_included_mc_index)`,
                lastMCI,
            );
            if (rows.length === 0)
                return checkAllLatestIncludedMcIndexesAreSet();

            for (const row of rows) {
                dbLimcisByUnit[row.unit] = row.latest_included_mc_index;
                await sqlstore.run(
                    'UPDATE units SET latest_included_mc_index=? WHERE unit=?',
                    [row.latest_included_mc_index, row.unit],
                );
            }
            await propagateLIMCI();
        }

        async function loadUnitProps(unit: Base64) {
            return Units.readUnitProps(unit);
        }

    }

    async function readLastStableMcUnit(): Promise<Base64> {
        const rows = await sqlstore.all(
            'SELECT unit FROM units WHERE is_on_main_chain=1 AND is_stable=1 ORDER BY main_chain_index DESC LIMIT 1',
        );
        if (rows.length === 0)
            throw Error('no units on stable MC?');
        return rows[0].unit;
    }

    async function updateStableMcFlag() {
        const lastMCU = await readLastStableMcUnit();
        const witnesses = await Witnesses.readWitnesses(lastMCU);
        const rows = await sqlstore.all(
            'SELECT unit, is_on_main_chain, main_chain_index, level FROM units WHERE best_parent_unit=?',
            [lastMCU],
        );
        if (rows.length === 0) {
            throw Error('no best children of last stable MC unit ' + lastMCU + '?');
        }
        const mcRows = rows.filter(row => row.is_on_main_chain === 1); // only one element
        const altRows = rows.filter(row => row.is_on_main_chain === 0);

        if (mcRows.length !== 1)
            throw Error('not a single MC child?');

        const firstUnstableMcIndex = mcRows[0].main_chain_index;
        const firstUnstableMcLevel = mcRows[0].level;
        const altBranchRootUnits = altRows.map(row => row.unit);

        const wlRows = await sqlstore.all('SELECT witnessed_level FROM units WHERE is_free=1 AND is_on_main_chain=1');
        if (wlRows.length !== 1)
            throw Error('not a single mc wl');
        // this is the level when we collect 7 witnesses if walking up the MC from its end
        const mcEndWitnessedLevel = wlRows[0].witnessed_level;
        const minWlRows = await sqlstore.all(`
                SELECT MIN(witnessed_level) AS min_mc_wl FROM units LEFT JOIN unit_authors USING(unit)
                WHERE is_on_main_chain=1 AND level>=? AND address IN(?)`,
            mcEndWitnessedLevel, witnesses,
        );
        if (minWlRows.length !== 1)
            throw Error('not a single min mc wl');
        const minMcWl = minWlRows[0].min_mc_wl;
        if (altBranchRootUnits.length === 0) { // no alt branches
            if (minMcWl >= firstUnstableMcLevel)
                await markMcIndexStable(firstUnstableMcIndex);
            return updateStableMcFlag();
        }

        const altBestChildren = await createListOfBestChildren(altBranchRootUnits);
        const maxAltRows = await sqlstore.all(`
                SELECT MAX(units.level) AS max_alt_level
                FROM units
                LEFT JOIN parenthoods ON units.unit=child_unit
                LEFT JOIN units AS punits ON parent_unit=punits.unit AND punits.witnessed_level >= units.witnessed_level
                WHERE units.unit IN(?) AND punits.unit IS NULL AND (
                    SELECT COUNT(*)
                    FROM unit_witnesses
                    WHERE unit_witnesses.unit IN(units.unit, units.witness_list_unit) AND unit_witnesses.address IN(?)
                )>=?`,
            altBestChildren, witnesses, conf.COUNT_WITNESSES - conf.MAX_WITNESS_LIST_MUTATIONS,
        );

        if (maxAltRows.length !== 1) {
            throw Error('not a single max alt level');
        }

        const maxAltLevel = maxAltRows[0].max_alt_level;
        if (minMcWl > maxAltLevel) {
            await markMcIndexStable(firstUnstableMcIndex);
            return updateStableMcFlag();
        }
    }

    // includes parentUnits
    async function createListOfBestChildren(parentUnits: Base64[]): Promise<Base64[]> {
        if (parentUnits.length === 0)
            return [];
        const bestChildren = parentUnits.slice();

        return goDownAndCollectBestChildren(parentUnits);

        async function goDownAndCollectBestChildren(startUnits: Base64[]) {
            const rows =
                await sqlstore.all('SELECT unit, is_free FROM units WHERE best_parent_unit IN(?)', allParents);

            if (rows.length === 0) {
                return bestChildren;
            }

            for (const row of rows) {
                bestChildren.push(row.unit);
                if (row.is_free !== 1) {
                    return goDownAndCollectBestChildren([row.unit]);
                }
            }

            return bestChildren;
        }
    }
}

enum Sequence {
    GOOD,
    FINAL_BAD,
    TEMP_BAD,
}

async function markMcIndexStable(mci: number) {
    // stabilize units
    await sqlstore.run('UPDATE units SET is_stable=1 WHERE is_stable=0 AND main_chain_index=?', mci);

    // handle non-serial units
    const rows = await sqlstore.all(
        `SELECT * FROM units WHERE main_chain_index=? AND sequence!='good' ORDER BY unit`, mci);

    for (const row of rows) {
        // final bad
        if (row.sequence === Sequence.FINAL_BAD) {
            if (!row.content_hash) {
                await setContentHash(row.unit);
            }
        }
        // temp bad
        if (row.content_hash) {
            // temp bad with content hash
            throw Error('temp-bad and with content_hash?');
        } else {
            // temp bad without content hash
            const stableConflictingUnits = await findStableConflictingUnits(row);
            const sequence = (stableConflictingUnits.length > 0) ? 'final-bad' : 'good';
            await sqlstore.run('UPDATE units SET sequence=? WHERE unit=?', sequence, row.unit);
            if (sequence === 'good') {
                await sqlstore.run('UPDATE inputs SET is_unique=1 WHERE unit=?', row.unit);
            } else {
                await setContentHash(row.unit);
            }
        }
    }

    return addBalls(mci);
}

async function setContentHash(unitHash: Base64) {
    const unit = await Units.read(unitHash);
    const contentHash = objectHash.getUnitContentHash(unit);
    await sqlstore.run(`UPDATE units SET content_hash=? WHERE unit=?`, contentHash, unitHash);
}

async function findStableConflictingUnits(unitProps: any) {
    const rows = await sqlstore.all(`
        SELECT competitor_units.*
        FROM unit_authors AS this_unit_authors
        JOIN unit_authors AS competitor_unit_authors USING(address)
        JOIN units AS competitor_units ON competitor_unit_authors.unit=competitor_units.unit
        JOIN units AS this_unit ON this_unit_authors.unit=this_unit.unit
        WHERE this_unit_authors.unit=? AND competitor_units.is_stable=1 AND +competitor_units.sequence=\'good\'
            -- if it were main_chain_index <= this_unit_limci, the competitor would\'ve been included
            AND (competitor_units.main_chain_index > this_unit.latest_included_mc_index)
            AND (competitor_units.main_chain_index <= this_unit.main_chain_index)`,
        [unitProps.unit],
    );

    const conflictUnits = [];

    for (const row of rows) {
        // TODO: compare
    }

    return conflictUnits;
}

async function addBalls(mci: number) {
    const rows = await sqlstore.all(`
            SELECT units.*, ball FROM units LEFT JOIN balls USING(unit)
            WHERE main_chain_index=? ORDER BY level`,
        mci,
    );


    for (const row of rows) {
        const unit = row.unit;
        const parentBalls = (await sqlstore.all(
            'SELECT ball FROM parenthoods LEFT JOIN balls ON parent_unit=unit WHERE child_unit=? ORDER BY ball',
            [unit],
        )).map(row => row.ball);
        const similarMcis = getSimilarMcis(mci);
        const skiplistUnits = [];
        const skiplistBalls = [];
        if (row.is_on_main_chain === 1 && similarMcis.length > 0) {
            const rows = await sqlstore.all(`
                SELECT units.unit, ball FROM units LEFT JOIN balls USING(unit)
                WHERE is_on_main_chain=1 AND main_chain_index IN(?)`,
                similarMcis,
            );
            for (const row of rows) {
                skiplistBalls.push(row.ball);
                skiplistUnits.push(row.unit);
                await addBall(unit, parentBalls, skiplistBalls);
            }
        } else {
            await addBall(unit, parentBalls, skiplistBalls);
        }
    }

    // update  retrievable
    // storage.updateMinRetrievableMciAfterStabilizingMci(conn, mci, function(min_retrievable_mci){
    //     profiler.stop('mc-mark-stable');
    //     calcCommissions();
    // });

    // calc commissions
    await hcom.calcHeadersCommissions();
    await pcom.updatePaidWitnesses();


    async function addBall(unit: Base64, parentBalls: Base64[], skiplistBalls: Base64[]) {
        const ball = objectHash.getBallHash(unit, parentBalls, skiplistBalls.sort(), false);

        await sqlstore.run(`INSERT INTO balls (ball, unit) VALUES(?,?)`, ball, unit);
        await sqlstore.run(`DELETE FROM hash_tree_balls WHERE ball=?`, ball);
    }
}

function getSimilarMcis(mci: number) {
    const similarMcis = [];
    let divisor = 10;
    while (true) {
        if (mci % divisor === 0) {
            similarMcis.push(mci - divisor);
            divisor *= 10;
        }
        else
            return similarMcis;
    }
}

