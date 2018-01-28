// Functions for reading headers commissions and witnessing outputs.
// In all functions below, type=(headers_commission|witnessing)
import sqlstore from '../storage/sqlstore';

export async function readNextSpendableMcIndex(type: string, address: Address): Promise<number> {
    const rows = await sqlstore.all(`
        SELECT to_main_chain_index FROM inputs CROSS JOIN units USING(unit)
        WHERE type=? AND address=? AND sequence='good'
        ORDER BY to_main_chain_index DESC LIMIT 1`,
        [type, address],
    );

    return (rows.length > 0) ? rows[0].to_main_chain_index + 1 : 0;
}

export async function readMaxSpendableMcIndex(type: string): Promise<number> {
    const table = type + '_outputs';
    const mci = await sqlstore.get('SELECT MAX(main_chain_index) AS max_mc_index FROM ' + table);
    return mci.max_mc_index || 0;
}


export async function findMcIndexIntervalToTargetAmount(type: string, address: Address, maxMCI: number, targetAmount: number) {
    const table = type + '_outputs';
    const fromMCI = await readNextSpendableMcIndex(type, address);
    if (fromMCI > maxMCI) {
        return [];
    }

    let maxSpendableMci = await readMaxSpendableMcIndex(type);
    if (maxSpendableMci <= 0) {
        return [];
    }
    if (maxSpendableMci >= maxMCI) {
        maxSpendableMci = maxMCI;
    }

    if (targetAmount === Infinity)
        targetAmount = 1e15;


    const MIN_MC_OUTPUT = (type === 'witnessing') ? 11 : 344;
    const maxCountOutputs = Math.ceil(targetAmount / MIN_MC_OUTPUT);
    const rows = await sqlstore.all(`
        SELECT main_chain_index, amount
        FROM ${table}
        WHERE is_spent=0 AND address=? AND main_chain_index>=? AND main_chain_index<=?
        ORDER BY main_chain_index LIMIT ?`,
        [address, fromMCI, maxSpendableMci, maxCountOutputs],
    );

    if (rows.length === 0) {
        return [];
    }

    let accumulated = 0;
    let toMCI;
    let hasSufficient = false;

    for (let i = 0; i < rows.length; i++) {
        accumulated += rows[i].amount;
        toMCI = rows[i].main_chain_index;
        if (accumulated > targetAmount) {
            hasSufficient = true;
            break;
        }
    }

    return [fromMCI, toMCI, accumulated, hasSufficient];
}

export async function calcEarnings(type: string, fromMCI: number, toMCI: number, address: Address): Promise<number> {
    const table = type + '_outputs';
    const total = (await sqlstore.get(`
        SELECT SUM(amount) AS total
        FROM ${table}
        WHERE main_chain_index>=? AND main_chain_index<=? AND address=?`,
        fromMCI, toMCI, address,
    )).total;

    return total;
}
