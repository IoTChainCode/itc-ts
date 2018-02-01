import sqlstore from '../storage/sqlstore';

export const minRetrievableMCI = null;
export default class MainChain {
    static minRetrievableMCI() {
        return minRetrievableMCI;
    }
    
    static async readLastMCI(): Promise<number> {
        const rows = await sqlstore.all(`SELECT MAX(main_chain_index) AS mci FROM units`);
        let lastMCI = rows[0].mci;
        if (lastMCI === null) // empty database
            lastMCI = 0;
        return lastMCI;
    }

    static async findLastBallMciOfMci(mci: number): Promise<number> {
        if (mci === 0)
            throw Error('findLastBallMciOfMci called with mci=0');
        const rows = await sqlstore.all(`
            SELECT lb_units.main_chain_index, lb_units.is_on_main_chain
            FROM units JOIN units AS lb_units ON units.last_ball_unit=lb_units.unit
            WHERE units.is_on_main_chain=1 AND units.main_chain_index=?`,
            mci,
        );

        if (rows.length !== 1)
            throw Error('last ball\'s mci count ' + rows.length + ' !== 1, mci = ' + mci);
        if (rows[0].is_on_main_chain !== 1)
            throw Error('lb is not on mc?');
        return rows[0].main_chain_index;
    }
}
