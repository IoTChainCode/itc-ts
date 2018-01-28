import sqlstore from '../storage/sqlstore';

type Balance = {
    stable: number,
    pending: number,
};

export type Balances = Map<string, Balance>;

export async function readBalance(address: Address): Promise<Balances> {
    const balances: Balances = new Map();
    balances['base'] = {stable: 0, pending: 0};

    let rows = await sqlstore.all(`
        SELECT asset, is_stable, SUM(amount) AS balance
        FROM outputs CROSS JOIN units USING(unit)
        WHERE is_spent=0 AND address=? AND sequence='good'
        GROUP BY asset, is_stable`,
        address,
    );

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        balances['base'][row.is_stable ? 'stable' : 'pending'] = row.balance;
    }


    rows = await sqlstore.all(`
        SELECT SUM(total) AS total FROM (
        SELECT SUM(amount) AS total FROM witnessing_outputs WHERE is_spent=0 AND address=?
        UNION ALL
        SELECT SUM(amount) AS total FROM headers_commission_outputs WHERE is_spent=0 AND address=? ) AS t`,
        address, address,
    );

    if (rows.length > 0) {
        balances['base'].stable += rows[0].total;
    }
    return balances;
}
