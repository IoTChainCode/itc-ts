import * as _ from 'lodash';
import * as chash from './checksum_hash';
import * as hash from './hash';
import {getSourceString} from './string_utils';
import Unit from '../core/unit';
import logger from './log';

export function getChash160(obj: any): string {
    return chash.getChash160(getSourceString(obj));
}

export function getChash288(obj: any): string {
    return chash.getChash288(getSourceString(obj));
}

export function getObjHashB64(obj: any): Base64 {
    return hash.sha256B64(getSourceString(obj));
}

export function getObjHashHex(obj: any): Hex {
    return hash.sha256Hex(getSourceString(obj));
}

function getNakedUnit(unit: Unit): any {
    const nakedMessages = [];
    for (const message of unit.messages) {
        nakedMessages.push({
            'app': message.app,
            'payloadHash': message.payloadHash,
            'payloadLocation': message.payloadLocation,
        });
    }

    const naked = {
        'version': unit.version,
        'alt': unit.alt,
        'witnesses': unit.witnesses,
        'messages': nakedMessages,
        'authors': unit.authors,
    };

    logger.info(naked, 'naked');
    return naked;
}

export function getUnitContentHash(unit: Unit): Base64 {
    return getObjHashB64(getNakedUnit(unit));
}

export function getUnitHash(unit: Unit): Base64 {
    const objStrippedUnit: any = {
        alt: unit.alt,
        authors: unit.authors.map(author => {
            return {address: author.address};
        }),
        contentHash: getUnitContentHash(unit),
        version: unit.version,
    };
    if (unit.witnessListUnit) {
        objStrippedUnit.witnessListUnit = unit.witnessListUnit;
    } else {
        objStrippedUnit.witnesses = unit.witnesses;
    }
    if (unit.parentUnits && unit.parentUnits.length > 0) {
        objStrippedUnit.parentUnits = unit.parentUnits;
        objStrippedUnit.lastBall = unit.lastBall;
        objStrippedUnit.lastBallUnit = unit.lastBallUnit;
    }

    return getObjHashB64(objStrippedUnit);
}

export function getUnitHashToSign(objUnit: any): Buffer {
    const objNakedUnit = getNakedUnit(objUnit);
    return hash.sha256(getSourceString(objNakedUnit));
}

export function getBallHash(unit: any, arrParentBalls: any, arrSkiplistBalls: any, bNonserial: any): Base64 {
    const objBall: any = {unit};
    if (arrParentBalls && arrParentBalls.length > 0) {
        objBall.parentBalls = arrParentBalls;
    }
    if (arrSkiplistBalls && arrSkiplistBalls.length > 0) {
        objBall.skiplistBalls = arrSkiplistBalls;
    }
    if (bNonserial) {
        objBall.isNonserial = true;
    }
    return getObjHashB64(objBall);
}

// export function getJointHash(joint: Joint): Base64 {
//     // we use JSON.stringify, we can't use objectHash here because it might throw errors
//     return hash.sha256B64(JSON.stringify(joint));
// }

function cleanNulls(obj: any) {
    Object.keys(obj).forEach((key) => {
        if (obj[key] === null) {
            delete obj[key];
        }
    });
}

export function pubKeyToAddress(pubKey: PubKey): Address {
    return ('0' + getChash160(pubKey));
}

function getDeviceMessageHashToSign(objDeviceMessage: any): Buffer {
    const objNakedDeviceMessage = _.clone(objDeviceMessage);
    delete objNakedDeviceMessage.signature;
    return hash.sha256(getSourceString(objNakedDeviceMessage));
}
