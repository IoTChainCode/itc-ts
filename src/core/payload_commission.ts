import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import * as mcOutputs from '../core/mc_outputs';

export async function calcWitnessEarnings(type: string, fromMCI: number, toMCI: number, address: Address): Promise<number> {
    const countRows = await sqlstore.get(
        `SELECT COUNT(*) AS count FROM units 
        WHERE is_on_main_chain=1 AND is_stable=1 AND main_chain_index>=? AND main_chain_index<=?`,
        [toMCI, toMCI + conf.COUNT_MC_BALLS_FOR_PAID_WITNESSING + 1],
    );

    if (countRows.count !== conf.COUNT_MC_BALLS_FOR_PAID_WITNESSING + 2) {
        throw new Error('not enough stable MC units after to_main_chain_index');
    }
    return mcOutputs.calcEarnings(type, fromMCI, toMCI, address);
}


export function getMaxSpendableMciForLastBallMci(lastBallMCI: number) {
    return lastBallMCI - 1 - conf.COUNT_MC_BALLS_FOR_PAID_WITNESSING;
}

export async function updatePaidWitnesses() {
    return null;
}
