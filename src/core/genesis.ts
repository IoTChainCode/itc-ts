import * as conf from '../common/conf';
import * as ohash from '../common/object_hash';

const genesisBall = ohash.getBallHash(conf.GENESIS_UNIT, null, null, null);

export function isGenesisUnit(unit: Base64): boolean {
    return (unit === conf.GENESIS_UNIT);
}

export function isGenesisBall(ball: Base64): boolean {
    return (ball === genesisBall);
}
