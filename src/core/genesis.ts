import * as conf from '../common/conf';
import * as ohash from '../common/object_hash';
import Unit from './unit';

const genesisBall = ohash.getBallHash(conf.GENESIS_UNIT, null, null, null);

export function isGenesisUnit(unit: Unit): boolean {
    // return (unit === conf.GENESIS_UNIT);
    // TODO: change later
    return !unit.parentUnits || unit.parentUnits.length === 0;
}

export function isGenesisBall(ball: Base64): boolean {
    return (ball === genesisBall);
}
