/*jslint node: true */
import sqlstore from '../storage/sqlstore';
import * as hash from '../common/hash';

let maxSpendableMCI = null;

export async function calcHeadersCommissions() {
    // we don't require neither source nor recipient to be majority witnessed
    // we don't want to return many times to the same MC index.
    if (maxSpendableMCI === null) {// first calc after restart only
        maxSpendableMCI = await initMaxSpendableMci();
    }
    // max_spendable_mci is old, it was last updated after previous calc
    const sinceMCI = maxSpendableMCI;

    // chunits is any child unit and contender for headers commission, punits is hc-payer unit
    const rows = await sqlstore.all(`
        SELECT chunits.unit AS child_unit, punits.headers_commission, next_mc_units.unit AS next_mc_unit, punits.unit AS payer_unit
        FROM units AS chunits
        JOIN parenthoods ON chunits.unit=parenthoods.child_unit
        JOIN units AS punits ON parenthoods.parent_unit=punits.unit
        JOIN units AS next_mc_units ON next_mc_units.is_on_main_chain=1 AND next_mc_units.main_chain_index=punits.main_chain_index+1
        WHERE chunits.is_stable=1
            AND +chunits.sequence='good'
            AND punits.main_chain_index>?
            AND +punits.sequence='good'
            AND punits.is_stable=1 
            AND chunits.main_chain_index-punits.main_chain_index<=1
            AND next_mc_units.is_stable=1`,
        sinceMCI,
    );

    const childrenInfos = {};
    rows.forEach(async (row) => {
        const payerUnit = row.payer_unit;
        const childUnit = row.child_unit;
        if (!childUnit[payerUnit]) {
            childUnit[payerUnit] = {
                headers_commission: row.headers_commission,
                children: [],
            };
        } else if (childrenInfos[payerUnit].headers_commission !== row.headers_commission) {
            throw new Error('different headers_commission');
        }
        delete row.headers_commission;
        delete row.payer_unit;
        childrenInfos[payerUnit].children.push(row);

        const wonAmounts = {};
        for (const unit in childrenInfos) {
            const headersCommission = childrenInfos[payerUnit].headers_commission;
            const winnerChildInfo = getWinnerInfo(childrenInfos[payerUnit].children);
            const childUnit = winnerChildInfo.child_unit;
            if (!wonAmounts[childUnit])
                wonAmounts[childUnit] = {};
            wonAmounts[childUnit][payerUnit] = headersCommission;
        }

        const winnerUnits = Object.keys(wonAmounts);

        const rows = await sqlstore.all(`
            SELECT unit_authors.unit, unit_authors.address, 100 AS earned_headers_commission_share
            FROM unit_authors
            LEFT JOIN earned_headers_commission_recipients USING(unit)
            WHERE unit_authors.unit IN () AND
            earned_headers_commission_recipients.unit IS NULL
            UNION ALL
            SELECT unit, address, earned_headers_commission_share
            WHERE unit IN ()`,
        );

        const values = [];
        rows.forEach(row => {
            const childUnit = row.unit;
            for (const payerUnit in wonAmounts[childUnit]) {
                const fullAmount = wonAmounts[childUnit][payerUnit];
                const amount = (row.earned_headers_commission_share === 100)
                    ? fullAmount
                    : Math.round(fullAmount * row.earned_headers_commission_share / 100.0);
                values.push(`(${payerUnit}, ${row.address}, ${amount}`);
            }
        });

        await sqlstore.run('INSERT INTO headers_commission_contributions (unit, address, amount) VALUES ' + values.join(', '));
    });
}

function getWinnerInfo(children: any[]) {
    if (children.length === 1)
        return children[0];
    children.forEach((child) => {
        child.hsah = hash.sha256Hex(child.child_unit + child.next_mc_unit);
    });
    children.sort((a, b) => {
        return ((a.hash < b.hash) ? -1 : 1);
    });
    return children[0];
}

async function initMaxSpendableMci() {
    const row = await sqlstore.get(`
        SELECT MAX(main_chain_index) AS max_spendable_mci FROM headers_commission_outputs`);
    return row.max_spendable_mci || 0;
}

export function getMaxSpendableMciForLastBallMci(lastBallMCI: number) {
    return lastBallMCI - 1;
}
