import Author from './author';
import {Message} from './message';
import * as objectHash from '../common/object_hash';
import * as objectLength from '../common/object_length';
import * as conf from '../common/conf';
import {isGenesisUnit} from './genesis';
import {isNonemptyArray, isStringOfLength} from '../common/validation_utils';

interface UnitValid {
    kind: 'ok';
}

interface UnitError {
    kind: 'unit_error';
    msg: string;
}

class Result {
    static ok(): UnitValid {
        return {kind: 'ok'};
    }

    static unitError(msg: string): UnitError {
        return {
            kind: 'unit_error',
            msg,
        };
    }
}

export type ValidateResult = UnitValid | UnitError;

export default class Unit {
    readonly version = conf.version;
    readonly alt = conf.alt;
    unit: Base64;
    headersCommission: number;
    payloadCommission: number;
    mainChainIndex?: number;
    timestamp?: number;
    isStable?: boolean;
    ball: Base64;
    contentHash: Base64;

    constructor(
        readonly parentUnits: Base64[],
        readonly lastBall: Base64,
        readonly lastBallUnit: Base64,
        readonly witnessListUnit: Base64,
        readonly authors: Author[],
        readonly witnesses: Address[],
        readonly messages: Message[],
    ) {
        this.headersCommission = this.calcHeadersCommission();
        this.payloadCommission = this.calcPayloadCommission();
    }

    calcHeadersCommission(): number {
        return objectLength.getHeadersSize(this);
    }

    calcPayloadCommission(): number {
        return objectLength.getTotalPayloadSize(this);
    }

    calcUnit(): Base64 {
        return objectHash.getUnitHash(this);
    }

    calcBall(): Base64 {
        return objectHash.getBallHash(this.unit, null, null, null);
    }

    static validateUnit(unit: Unit): ValidateResult {
        if (!isStringOfLength(unit.unit, conf.HASH_LENGTH))
            return Result.unitError(`wrong unit length: ${unit.unit}`);

        if (objectHash.getUnitHash(unit) !== unit.unit)
            return Result.unitError('wrong unit hash');

        if (isGenesisUnit(unit)) {
            return Result.ok();
        }

        if (!isNonemptyArray(unit.parentUnits))
            return Result.unitError('missing or empty parent units array');
        if (!isStringOfLength(unit.lastBall, conf.HASH_LENGTH))
            return Result.unitError('wrong length of last ball');
        if (!isStringOfLength(unit.lastBallUnit, conf.HASH_LENGTH))
            return Result.unitError('wrong length of last ball unit');

        return Result.ok();
    }
}
