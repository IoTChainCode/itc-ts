// import {sendMail} from '../common/mail';
// import * as conf from '../common/conf';
// import network from '../core/network';
// import {Output} from '../core/message';
// import sqlstore from '../storage/sqlstore';
// import storage from '../storage/storage';
// import {composeUnit} from '../core/composer';
// import {compose} from 'async';
//
// const WITNESSING_COST = 600; // size of typical witnessing unit
// let myAddress;
// let count_witnessings_available = 0;
// let isWitnessingUnderWay = false;
// let forcedWitnessingTimer;
//
// function notifyAdmin(subject, body) {
//     sendMail({
//         to: conf.ADMIN_EMAIL,
//         from: conf.FROM_EMAIL,
//         subject: subject,
//         body: body,
//     });
// }
//
// function notifyAdminAboutFailedWitnessing(err) {
//     console.log('witnessing failed: ' + err);
//     notifyAdmin('witnessing failed: ' + err, err);
// }
//
// function notifyAdminAboutWitnessingProblem(err) {
//     console.log('witnessing problem: ' + err);
//     notifyAdmin('witnessing problem: ' + err, err);
// }
//
//
// function witness(onDone) {
//     function onError(err) {
//         notifyAdminAboutFailedWitnessing(err);
//         setTimeout(onDone, 60000); // pause after error
//     }
//
//     createOptimalOutputs(function (arrOutputs) {
//         let params = {
//             paying_addresses: [my_address],
//             outputs: arrOutputs,
//             signer: headlessWallet.signer,
//             callbacks: composer.getSavingCallbacks({
//                 ifNotEnoughFunds: onError,
//                 ifError: onError,
//                 ifOk: function (objJoint) {
//                     network.broadcastUnit(objJoint);
//                     onDone();
//                 }
//             })
//         };
//         const unit = composeUnit([], [], [myAddress], )
//     });
// }
//
// async function checkAndWitness() {
//     console.log('checkAndWitness');
//     clearTimeout(forcedWitnessingTimer);
//     if (isWitnessingUnderWay)
//         return console.log('witnessing under way');
//     isWitnessingUnderWay = true;
//     // abort if there are my units without an mci
//     const bMyUnitsWithoutMci = determineIfThereAreMyUnitsWithoutMci();
//         if (bMyUnitsWithoutMci) {
//             isWitnessingUnderWay = false;
//             return console.log('my units without mci');
//         }
//         storage.readLastMainChainIndex(function (max_mci) {
//             let col = (conf.storage === 'mysql') ? 'main_chain_index' : 'unit_authors.rowid';
//             db.query(
//                 'SELECT main_chain_index AS max_my_mci FROM units JOIN unit_authors USING(unit) WHERE +address=? ORDER BY ' + col + ' DESC LIMIT 1',
//                 [my_address],
//                 function (rows) {
//                     var max_my_mci = (rows.length > 0) ? rows[0].max_my_mci : -1000;
//                     var distance = max_mci - max_my_mci;
//                     console.log('distance=' + distance);
//                     if (distance > conf.THRESHOLD_DISTANCE) {
//                         console.log('distance above threshold, will witness');
//                         setTimeout(function () {
//                             witness(function () {
//                                 bWitnessingUnderWay = false;
//                             });
//                         }, Math.round(Math.random() * 3000));
//                     }
//                     else {
//                         bWitnessingUnderWay = false;
//                         checkForUnconfirmedUnits(conf.THRESHOLD_DISTANCE - distance);
//                     }
//                 }
//             );
//         });
//     });
// }
//
// async function determineIfThereAreMyUnitsWithoutMci(): Promise<boolean> {
//     const rows = await sqlstore.all(
//         'SELECT 1 FROM units JOIN unit_authors USING(unit) WHERE address=? AND main_chain_index IS NULL LIMIT 1',
//         [myAddress],
//     );
//     return rows.length > 0;
// }
//
// async function checkForUnconfirmedUnits(distance_to_threshold) {
//     const rows = await sqlstore.all( // look for unstable non-witness-authored units
//         `SELECT 1 FROM units CROSS JOIN unit_authors USING(unit) LEFT JOIN my_witnesses USING(address)
//         WHERE (main_chain_index>? OR main_chain_index IS NULL AND sequence='good')
//             AND my_witnesses.address IS NULL
//             AND NOT (
//                 (SELECT COUNT(*) FROM messages WHERE messages.unit=units.unit)=1
//                 AND (SELECT COUNT(*) FROM unit_authors WHERE unit_authors.unit=units.unit)=1
//                 AND (SELECT COUNT(DISTINCT address) FROM outputs WHERE outputs.unit=units.unit)=1
//                 AND (SELECT address FROM outputs WHERE outputs.unit=units.unit LIMIT 1)=unit_authors.address
//             )
//         LIMIT 1`,
//         [storage.getMinRetrievableMci()],
//     ); // light clients see all retrievable as unconfirmed
//     if (rows.length === 0)
//         return;
//     const timeout = Math.round((distance_to_threshold + Math.random()) * 10000);
//     console.log('scheduling unconditional witnessing in ' + timeout + ' ms unless a new unit arrives');
//     forcedWitnessingTimer = setTimeout(witnessBeforeThreshold, timeout);
// }
//
// async function witnessBeforeThreshold() {
//     if (isWitnessingUnderWay)
//         return;
//     isWitnessingUnderWay = true;
//     const myUnitsWithoutMci = await determineIfThereAreMyUnitsWithoutMci();
//     if (myUnitsWithoutMci) {
//         isWitnessingUnderWay = false;
//         return;
//     }
//     console.log('will witness before threshold');
//     witness(function () {
//         isWitnessingUnderWay = false;
//     });
// }
//
// async function readNumberOfWitnessingsAvailable(): Promise<number> {
//     count_witnessings_available--;
//     if (count_witnessings_available > conf.MIN_AVAILABLE_WITNESSINGS)
//         return count_witnessings_available;
//     let rows = await sqlstore.all(`
//         SELECT COUNT(*) AS count_big_outputs FROM outputs JOIN units USING(unit)
//         WHERE address=? AND is_stable=1 AND amount>=? AND asset IS NULL AND is_spent=0`,
//         [myAddress, WITNESSING_COST],
//     );
//
//     const count_big_outputs = rows[0].count_big_outputs;
//     rows = await sqlstore.all(`
//         SELECT SUM(amount) AS total FROM outputs JOIN units USING(unit)
//         WHERE address=? AND is_stable=1 AND amount<? AND asset IS NULL AND is_spent=0
//         UNION
//         SELECT SUM(amount) AS total FROM witnessing_outputs
//         WHERE address=? AND is_spent=0
//         UNION
//         SELECT SUM(amount) AS total FROM headers_commission_outputs
//         WHERE address=? AND is_spent=0`,
//         [myAddress, WITNESSING_COST, myAddress, myAddress],
//     );
//     const total = rows.reduce((acc, cur) => acc + cur, 0);
//     const count_witnessings_paid_by_small_outputs_and_commissions = Math.round(total / WITNESSING_COST);
//     count_witnessings_available = count_big_outputs + count_witnessings_paid_by_small_outputs_and_commissions;
//     return count_witnessings_available;
// }
//
// // make sure we never run out of spendable (stable) outputs.
// // Keep the number above a threshold, and if it drops below, produce more outputs than consume.
// async function createOptimalOutputs(handleOutputs): Promise<Output[]> {
//     const outputs = [new Output(myAddress, 0)];
//     const count = await readNumberOfWitnessingsAvailable();
//     if (count > conf.MIN_AVAILABLE_WITNESSINGS)
//         return outputs;
//     // try to split the biggest output in two
//     const rows = await sqlstore.all(`
//         SELECT amount FROM outputs JOIN units USING(unit)
//         WHERE address=? AND is_stable=1 AND amount>=? AND asset IS NULL AND is_spent=0
//         ORDER BY amount DESC LIMIT 1`,
//         [myAddress, 2 * WITNESSING_COST],
//     );
//     if (rows.length === 0) {
//         notifyAdminAboutWitnessingProblem('only ' + count + ' spendable outputs left, and can\'t add more');
//         return outputs;
//     }
//     const amount = rows[0].amount;
//     notifyAdminAboutWitnessingProblem('only ' + count + ' spendable outputs left, will split an output of ' + amount);
//     outputs.push(new Output(myAddress, Math.round(amount / 2));
//     return outputs;
// }
//
// // my_address = address;
// checkAndWitness();
//
