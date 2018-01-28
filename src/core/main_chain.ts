import storage from '../storage/storage';
import sqlstore from '../storage/sqlstore';
import * as _ from 'lodash';
import * as genesis from '../core/genesis';
import * as hcom from '../core/headers_commission';
import * as pcom from '../core/payload_commission';
import * as objectHash from '../common/object_hash';

// override when adding units which caused witnessed level to significantly retreat
const retreatingUnits = [
    '+5ntioHT58jcFb8oVc+Ff4UvO5UvYGRcrGfYIofGUW8=',
    'C/aPdM0sODPLC3NqJPWdZlqmV8B4xxf2N/+HSEi0sKU=',
    'sSev6hvQU86SZBemy9CW2lJIko2jZDoY55Lm3zf2QU4=',
    '19GglT3uZx1WmfWstLb3yIa85jTic+t01Kpe6s5gTTA=',
    'Hyi2XVdZ/5D3H/MhwDL/jRWHp3F/dQTmwemyUHW+Urg=',
    'xm0kFeKh6uqSXx6UUmc2ucgsNCU5h/e6wxSMWirhOTo=',
];


export async function determineIfStableInLaterUnits(earlierUnit: string, laterUnits: any[]) {
    const [earlierUnitProps, laterUnitProps] = await storage.readPropsOfUnits(earlierUnit, laterUnits);
    if (earlierUnitProps.is_free === 1)
        return false;
    return true;
}


export async function updateMainChain(fromUnit: Base64, lastAddedUnit: Base64) {
    let allParents = [];
    const newMcUnits = [];

    // if unit === null, read free balls
    async function findNextUpMainChainUnit(unit: Base64) {
        function handleProps(props) {
            if (props.best_parent_unit === null)
                throw Error('best parent is null');
            console.log('unit ' + unit + ', best parent ' + props.best_parent_unit + ', wlevel ' + props.witnessed_level);
            return props.best_parent_unit;
        }

        async function readLastUnitProps() {
            const rows = await sqlstore.all(`
                SELECT unit AS best_parent_unit, witnessed_level
                FROM units WHERE is_free=1
				ORDER BY witnessed_level DESC,
					level-witnessed_level ASC,
					unit ASC
				LIMIT 5`,
            );
            if (rows.length === 0)
                throw Error('no free units?');
            if (rows.length > 1) {
                const parents = rows.map(function (row) {
                    return row.best_parent_unit;
                });
                allParents = parents;
                for (let i = 0; i < retreatingUnits.length; i++) {
                    const n = parents.indexOf(retreatingUnits[i]);
                    if (n >= 0)
                        return rows[n];
                }
            }
            return rows[0];
        }

        return unit ? storage.readStaticUnitProps(unit) : readLastUnitProps();
    }

    async function goUpFromUnit(unit: Base64) {
        if (genesis.isGenesisUnit(unit))
            return checkNotRebuildingStableMainChainAndGoDown(0, unit);

        const bestParentUnit = await findNextUpMainChainUnit(unit);
        const props = await storage.readUnitProps(bestParentUnit);

        const objBestParentUnitProps2 = storage.unstableUnits[bestParentUnit];
        if (!objBestParentUnitProps2)
            throw Error('unstable unit not found: ' + bestParentUnit);
        const objBestParentUnitPropsForCheck = _.cloneDeep(objBestParentUnitProps2);
        delete objBestParentUnitPropsForCheck.parent_units;
        if (!_.isEqual(objBestParentUnitPropsForCheck, props))
            throw Error('different props');
        if (!props.is_on_main_chain) {
            await sqlstore.run('UPDATE units SET is_on_main_chain=1, main_chain_index=NULL WHERE unit=?', [bestParentUnit]);
            objBestParentUnitProps2.is_on_main_chain = 1;
            objBestParentUnitProps2.main_chain_index = null;
            newMcUnits.push(bestParentUnit);
            return goUpFromUnit(bestParentUnit);
        } else {
            if (unit === null)
                return updateLatestIncludedMcIndex(props.main_chain_index, false);
            else
                return checkNotRebuildingStableMainChainAndGoDown(props.main_chain_index, bestParentUnit);
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
        //"UPDATE units SET is_on_main_chain=0, main_chain_index=NULL WHERE is_on_main_chain=1 AND main_chain_index>?",
        await sqlstore.run(
            'UPDATE units SET is_on_main_chain=0, main_chain_index=NULL WHERE main_chain_index>?',
            [lastMCI],
        );

        for (const u in storage.unstableUnits) {
            const unit = storage.unstableUnits[u];
            if (unit.mainChainIndex > lastMCI) {
                unit.is_on_main_chain = 0;
                unit.main = null;
            }
        }

        let mci = lastMCI;
        let mcu = lastMCU;

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

            async function goUp(startUnits: Base64[]) {
                const rows = await sqlstore.all(`
                    SELECT DISTINCT unit
                    FROM parenthoods JOIN units ON parent_unit=unit
                    WHERE child_unit IN(?) AND main_chain_index IS NULL`,
                    [startUnits],
                );
                const newStartUnits = rows.map(row => row.unit);
                const newStartUnits2 = [];
                for (const startUnit of startUnits) {
                    storage.unstableUnits[startUnit].parentUnits.forEach(parent => {
                        if (storage.unstableUnits[parent] && storage.unstableUnits[parent].main_chain_index === null && newStartUnits2.indexOf(parent) === -1)
                            newStartUnits2.push(parent);
                    });
                }
                if (!_.isEqual(newStartUnits.sort(), newStartUnits2.sort()))
                    throw Error('different new start units');
                if (newStartUnits.length === 0)
                    return updateMC();
                units = units.concat(newStartUnits);
                return goUp(newStartUnits);
            }

            async function updateMc() {
                units.forEach((unit) => {
                    storage.unstableUnits[unit].main_chain_index = mci;
                });
                const unitList = units.join(', ');
                await sqlstore.run('UPDATE units SET main_chain_index=? WHERE unit IN("+strUnitList+")', [mci]);
                await sqlstore.run('UPDATE unit_authors SET _mci=? WHERE unit IN("+strUnitList+")', [mci]);
            }

            await goUp(units);
        }

        await sqlstore.all(
            'UPDATE unit_authors SET _mci=NULL WHERE unit IN(SELECT unit FROM units WHERE main_chain_index IS NULL)');

    }

    async function updateLatestIncludedMcIndex(lastMCI: number, rebuiltMc: boolean) {

        async function checkAllLatestIncludedMcIndexesAreSet() {
            if (!_.isEqual(assocDbLimcisByUnit, assocLimcisByUnit))
                throw Error('different LIMCIs, mem: ' + JSON.stringify(assocLimcisByUnit) + ', db: ' + JSON.stringify(assocDbLimcisByUnit));
            const rows = await sqlstore.all('SELECT unit FROM units WHERE latest_included_mc_index IS NULL AND level!=0');
            if (rows.length > 0)
                throw Error(rows.length + ' units have latest_included_mc_index=NULL, e.g. unit ' + rows[0].unit);
            return await updateStableMcFlag();
        }

        async function propagateLIMCI() {
            // the 1st condition in WHERE is the same that was used 2 queries ago to NULL limcis
            const rows = await sqlstore.all(
                /*
                "UPDATE units AS punits \n\
                JOIN parenthoods ON punits.unit=parent_unit \n\
                JOIN units AS chunits ON child_unit=chunits.unit \n\
                SET chunits.latest_included_mc_index=punits.latest_included_mc_index \n\
                WHERE (chunits.main_chain_index > ? OR chunits.main_chain_index IS NULL) \n\
                    AND (chunits.latest_included_mc_index IS NULL OR chunits.latest_included_mc_index < punits.latest_included_mc_index)",
                [last_main_chain_index],
                function(result){
                    (result.affectedRows > 0) ? propagateLIMCI() : checkAllLatestIncludedMcIndexesAreSet();
                }
                */
                `SELECT punits.latest_included_mc_index, chunits.unit
                FROM units AS punits
                JOIN parenthoods ON punits.unit=parent_unit
                JOIN units AS chunits ON child_unit=chunits.unit
                WHERE (chunits.main_chain_index > ? OR chunits.main_chain_index IS NULL)
                    AND (chunits.latest_included_mc_index IS NULL OR chunits.latest_included_mc_index < punits.latest_included_mc_index)`,
                [lastMCI],
            );
            if (rows.length === 0)
                return checkAllLatestIncludedMcIndexesAreSet();

            for (const row of rows) {
                assocDbLimcisByUnit[row.unit] = row.latest_included_mc_index;
                await sqlstore.run(
                    'UPDATE units SET latest_included_mc_index=? WHERE unit=?',
                    [row.latest_included_mc_index, row.unit],
                );
                propagateLIMCI();
            }
        }

        async function loadUnitProps(unit: Base64) {
            if (storage.unstableUnits[unit])
                return storage.unstableUnits[unit];
            return storage.readUnitProps(unit);
        }

        async function calcLIMCIs(onUpdated) {
            const filledUnits = [];
            for (const unit in assocChangedUnits) {
                const props = assocChangedUnits[unit];
                let maxLimCi = -1;
                for (const parent of props.parentUnits) {
                    const parentProps = await loadUnitProps(parent);
                    if (parentProps.is_on_main_chain) {
                        props.latest_included_mc_index = parentProps.main_chain_index;
                        assocLimcisByUnit[unit] = props.latest_included_mc_index;
                        filledUnits.push(unit);
                        break;
                    }
                    if (parentProps.latest_included_mc_index === null)
                        throw Error('parent limci not known yet');
                    if (parentProps.latest_included_mc_index > maxLimCi)
                        maxLimCi = parentProps.latest_included_mc_index;
                }

                if (maxLimCi < 0)
                    throw Error('max limci < 0 for unit');
                props.latest_included_mc_index = maxLimCi;
                assocLimcisByUnit[unit] = props.latest_included_mc_index;
                filledUnits.push(unit);
            }

            filledUnits.forEach(unit => {
                delete assocChangedUnits[unit];
            });
            if (Object.keys(assocChangedUnits).length > 0)
                return await calcLIMCIs(onUpdated);
            else
                return await onUpdated();
        }

        const assocChangedUnits = {};
        const assocLimcisByUnit = {};
        const assocDbLimcisByUnit = {};

        for (const unit in storage.unstableUnits) {
            const o = storage.unstableUnits[unit];
            if (o.main_chain_index > lastMCI || o.main_chain_index === null) {
                o.latest_included_mc_index = null;
                assocChangedUnits[unit] = o;
            }
        }

        await calcLIMCIs(async () => {
            await sqlstore.run(
                'UPDATE units SET latest_included_mc_index=NULL WHERE main_chain_index>? OR main_chain_index IS NULL',
                [lastMCI],
            );
            const rows = await sqlstore.all(
                // if these units have other parents, they cannot include later MC units (otherwise, the parents would've been redundant).
                // the 2nd condition in WHERE is the same that was used 1 query ago to NULL limcis.

                // I had to rewrite this single query because sqlite doesn't support JOINs in UPDATEs
                /*
                "UPDATE units AS punits \n\
                JOIN parenthoods ON punits.unit=parent_unit \n\
                JOIN units AS chunits ON child_unit=chunits.unit \n\
                SET chunits.latest_included_mc_index=punits.main_chain_index \n\
                WHERE punits.is_on_main_chain=1 \n\
                    AND (chunits.main_chain_index > ? OR chunits.main_chain_index IS NULL) \n\
                    AND chunits.latest_included_mc_index IS NULL",
                [last_main_chain_index],
                function(result){
                    if (result.affectedRows === 0 && bRebuiltMc)
                        throw "no latest_included_mc_index updated";
                    propagateLIMCI();
                }
                */`
                    SELECT chunits.unit, punits.main_chain_index
                    FROM units AS punits
                    JOIN parenthoods ON punits.unit=parent_unit
                    JOIN units AS chunits ON child_unit=chunits.unit
                    WHERE punits.is_on_main_chain=1
                        AND (chunits.main_chain_index > ? OR chunits.main_chain_index IS NULL)
                        AND chunits.latest_included_mc_index IS NULL`,
                [lastMCI],
            );
            if (rows.length === 0 && rebuiltMc)
                throw Error('no latest_included_mc_index updated, last_mci=' + lastMCI + ', affected=');

            for (const row of rows) {
                assocDbLimcisByUnit[row.unit] = row.main_chain_index;
                await sqlstore.run('UPDATE units SET latest_included_mc_index=? WHERE unit=?',
                    [row.main_chain_index, row.unit],
                );
            }
            return await propagateLIMCI();
        });

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
            const witnesses = await storage.readWitnesses(lastMCU);
            const rows = await sqlstore.all(
                'SELECT unit, is_on_main_chain, main_chain_index, level FROM units WHERE best_parent_unit=?',
                [lastMCU],
            );
            if (rows.length === 0) {
                //if (isGenesisUnit(last_stable_mc_unit))
                //    return finish();
                throw Error('no best children of last stable MC unit ' + lastMCU + '?');
            }
            const mcRows = rows.filter(function (row) {
                return (row.is_on_main_chain === 1);
            }); // only one element

            const altRows = rows.filter(function (row) {
                return (row.is_on_main_chain === 0);
            });

            if (mcRows.length !== 1)
                throw Error('not a single MC child?');

            const first_unstable_mc_unit = mcRows[0].unit;
            const first_unstable_mc_index = mcRows[0].main_chain_index;
            const first_unstable_mc_level = mcRows[0].level;
            const altBranchRootUnits = altRows.map(function (row) {
                return row.unit;
            });

            async function advanceLastStableMcUnitAndTryNext() {
                markMcIndexStable(conn, first_unstable_mc_index, updateStableMcFlag);
            }

            const wlRows = await sqlstore.all('SELECT witnessed_level FROM units WHERE is_free=1 AND is_on_main_chain=1');
            if (wlRows.length !== 1)
                throw Error('not a single mc wl');
            // this is the level when we colect 7 witnesses if walking up the MC from its end
            const mc_end_witnessed_level = wlRows[0].witnessed_level;

            const minWlRows = await sqlstore.all(
                // among these 7 witnesses, find min wl
                `
            SELECT MIN(witnessed_level) AS min_mc_wl FROM units LEFT JOIN unit_authors USING(unit)
            WHERE is_on_main_chain=1 AND level>=? AND address IN(?)`, // _left_ join enforces the best query plan in sqlite
                [mc_end_witnessed_level, witnesses],
            );
            if (minWlRows.length !== 1)
                throw Error('not a single min mc wl');

            const minMcWl = minWlRows[0].min_mc_wl;

            if (altBranchRootUnits.length === 0) { // no alt branches
                if (minMcWl >= first_unstable_mc_level)
                    return advanceLastStableMcUnitAndTryNext();
                return finish();
            }
        }

        createListOfBestChildren(altBranchRootUnits, function (arrAltBestChildren) {
            // Compose a set S of units that increase WL, that is their own WL is greater than that of every parent.
            // In this set, find max L. Alt WL will never reach it. If min_mc_wl > L, next MC unit is stable.
            // Also filter the set S to include only those units that are conformant with the last stable MC unit.
            conn.query(
                'SELECT MAX(units.level) AS max_alt_level \n\
                FROM units \n\
                LEFT JOIN parenthoods ON units.unit=child_unit \n\
                LEFT JOIN units AS punits ON parent_unit=punits.unit AND punits.witnessed_level >= units.witnessed_level \n\
                WHERE units.unit IN(?) AND punits.unit IS NULL AND ( \n\
                    SELECT COUNT(*) \n\
                    FROM unit_witnesses \n\
                    WHERE unit_witnesses.unit IN(units.unit, units.witness_list_unit) AND unit_witnesses.address IN(?) \n\
                )>=?',
                [arrAltBestChildren, arrWitnesses, constants.COUNT_WITNESSES - constants.MAX_WITNESS_LIST_MUTATIONS],
                function (max_alt_rows) {
                    if (max_alt_rows.length !== 1)
                        throw Error('not a single max alt level');
                    var max_alt_level = max_alt_rows[0].max_alt_level;
                    (min_mc_wl > max_alt_level) ? advanceLastStableMcUnitAndTryNext() : finish();
                }
            );
        });
    }


// also includes arrParentUnits
    async function createListOfBestChildren(parentUnits: Base64[]) {
        if (parentUnits.length === 0)
            return [];
        const bestChildren = parentUnits.slice();

        async function goDownAndCollectBestChildren(startUnits: Base64[]) {
            const rows =
                await sqlstore.all('SELECT unit, is_free FROM units WHERE best_parent_unit IN(?)', [startUnits]);
            if (rows.length === 0)
                return;

            for (const row in rows) {
                bestChildren.push(row.unit);
                if (rows.is_free === 1) {
                    //
                } else {
                    await goDownAndCollectBestChildren([row.unit]);
                }
            }
        }

        await goDownAndCollectBestChildren(parentUnits);
        return bestChildren;
    }

    return goUpFromUnit(fromUnit);
}

async function markMcIndexStable(mci: number) {
    const stabilizedUnits = [];
    for (const unit in storage.unstableUnits) {
        const o = storage.unstableUnits.get(unit);
        if (o.mainChainIndex === mci && o.isStable === false) {
            o.isStable = true;
            storage.stableUnits.set(unit, o);
        }
    }

    stabilizedUnits.forEach(function (unit) {
        storage.unstableUnits.delete(unit);
    });

    await sqlstore.all('UPDATE units SET is_stable=1 WHERE is_stable=0 AND main_chain_index=?',
        [mci],
    );

    // handleNonserialUnits
    const rows = await sqlstore.all(
        'SELECT * FROM units WHERE main_chain_index=? AND sequence!=\'good\' ORDER BY unit', [mci],
    );

    for (const row of rows) {
        // if (row.sequence === 'final-bad')
        //     return row.content_hash ? cb() : setContentHash(row.unit, cb);
        // // temp-bad
        // if (row.content_hash)
        //     throw Error('temp-bad and with content_hash?');

    }
}

//     function (rows) {
//         async.eachSeries(
//             rows,
//             function (row, cb) {
//                 findStableConflictingUnits(row, function (arrConflictingUnits) {
//                     var sequence = (arrConflictingUnits.length > 0) ? 'final-bad' : 'good';
//                     console.log('unit ' + row.unit + ' has competitors ' + arrConflictingUnits + ', it becomes ' + sequence);
//                     conn.query('UPDATE units SET sequence=? WHERE unit=?', [sequence, row.unit], function () {
//                         if (sequence === 'good')
//                             conn.query('UPDATE inputs SET is_unique=1 WHERE unit=?', [row.unit], function () {
//                                 cb();
//                             });
//                         else
//                             setContentHash(row.unit, cb);
//                     });
//                 });
//             },
//             function () {
//                 //if (rows.length > 0)
//                 //    throw "stop";
//                 // next op
//                 addBalls();
//             }
//         );
//     }
//
// )
//     ;
// }

async function setContentHash(unit: Base64) {
    const joint = await storage.readJoint(unit);
    const contentHash = objectHash.getUnitContentHash(joint.unit);
    await sqlstore.run(`UPDATE units SET content_hash=? WHERE unit=?`, [contentHash, unit]);
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
        // if on the same mci, the smallest unit wins becuse it got selected earlier and was assigned sequence=good
        [unitProps.unit],
    );


    //     function (rows) {
    //         var arrConflictingUnits = [];
    //         async.eachSeries(
    //             rows,
    //             function (row, cb) {
    //                 graph.compareUnitsByProps(conn, row, objUnitProps, function (result) {
    //                     if (result === null)
    //                         arrConflictingUnits.push(row.unit);
    //                     cb();
    //                 });
    //             },
    //             function () {
    //                 handleConflictingUnits(arrConflictingUnits);
    //             }
    //         );
    //     }
    // );
}

async function addBalls(mci: number) {
    const rows = await sqlstore.all(`
            SELECT units.*, ball FROM units LEFT JOIN balls USING(unit)
            WHERE main_chain_index=? ORDER BY level`,
        [mci],
    );

    for (const row of rows) {
        const unit = row.unit;
        const parentBalls = await sqlstore.all(
            'SELECT ball FROM parenthoods LEFT JOIN balls ON parent_unit=unit WHERE child_unit=? ORDER BY ball',
            [unit],
        );


    }
}

async function addBall(unit: Base64, parentBalls: Base64[], skiplistBalls: Base64[], unitProps: any) {
    const ball = objectHash.getBallHash(unit, parentBalls, skiplistBalls.sort(), false);

    await sqlstore.run(`INSERT INTO balls (ball, unit) VALUES(?,?)`, [ball, unit]);
    await sqlstore.run(`DELETE FROM hash_tree_balls WHERE ball=?`, [ball]);
}
//
//     function (unit_rows) { async.eachSeries( unit_rows,
//             function (objUnitProps, cb) {
//                 var unit = objUnitProps.unit;
//                 conn.query(
//                     'SELECT ball FROM parenthoods LEFT JOIN balls ON parent_unit=unit WHERE child_unit=? ORDER BY ball',
//                     [unit],
//                     function (parent_ball_rows) {
//                         if (parent_ball_rows.some(function (parent_ball_row) {
//                                 return (parent_ball_row.ball === null);
//                             }))
//                             throw Error('some parent balls not found for unit ' + unit);
//                         var arrParentBalls = parent_ball_rows.map(function (parent_ball_row) {
//                             return parent_ball_row.ball;
//                         });
//                         var arrSimilarMcis = getSimilarMcis(mci);
//                         var arrSkiplistUnits = [];
//                         var arrSkiplistBalls = [];
//                         if (objUnitProps.is_on_main_chain === 1 && arrSimilarMcis.length > 0) {
//                             conn.query(
//                                 'SELECT units.unit, ball FROM units LEFT JOIN balls USING(unit) \n\
//                                 WHERE is_on_main_chain=1 AND main_chain_index IN(?)',
//                                 [arrSimilarMcis],
//                                 function (rows) {
//                                     rows.forEach(function (row) {
//                                         var skiplist_unit = row.unit;
//                                         var skiplist_ball = row.ball;
//                                         if (!skiplist_ball)
//                                             throw Error('no skiplist ball');
//                                         arrSkiplistUnits.push(skiplist_unit);
//                                         arrSkiplistBalls.push(skiplist_ball);
//                                     });
//                                     addBall();
//                                 }
//                             );
//                         }
//                         else
//                             addBall();
//
//                         function addBall() {
//                             var ball = objectHash.getBallHash(unit, arrParentBalls, arrSkiplistBalls.sort(), objUnitProps.sequence === 'final-bad');
//                             if (objUnitProps.ball) { // already inserted
//                                 if (objUnitProps.ball !== ball)
//                                     throw Error('stored and calculated ball hashes do not match, ball=' + ball + ', objUnitProps=' + JSON.stringify(objUnitProps));
//                                 return cb();
//                             }
//                             conn.query('INSERT INTO balls (ball, unit) VALUES(?,?)', [ball, unit], function () {
//                                 conn.query('DELETE FROM hash_tree_balls WHERE ball=?', [ball], function () {
//                                     if (arrSkiplistUnits.length === 0)
//                                         return cb();
//                                     conn.query(
//                                         'INSERT INTO skiplist_units (unit, skiplist_unit) VALUES '
//                                         + arrSkiplistUnits.map(function (skiplist_unit) {
//                                             return '(' + conn.escape(unit) + ', ' + conn.escape(skiplist_unit) + ')';
//                                         }),
//                                         function () {
//                                             cb();
//                                         }
//                                     );
//                                 });
//                             });
//                         }
//                     }
//                 );
//             },
//             function () {
//                 // next op
//                 updateRetrievable();
//             }
//         );
//     }
//
// );
// }
//
// function updateRetrievable() {
//     storage.updateMinRetrievableMciAfterStabilizingMci(conn, mci, function (min_retrievable_mci) {
//         returncalcCommissions();
//     });
// }

async function calcCommissions() {
    await hcom.calcHeadersCommissions();
    await pcom.updatePaidWitnesses();
}

