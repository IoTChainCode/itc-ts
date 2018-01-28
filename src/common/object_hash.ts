import * as _ from 'lodash';
import * as chash from './checksum_hash';
import * as hash from './hash';
import {getSourceString} from './string_utils';
import Unit from '../core/unit';
import Joint from '../core/joint';

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
    };

    return naked;
}

export function getUnitContentHash(unit: Unit): Base64 {
    return getObjHashB64(getNakedUnit(unit));
}

export function getUnitHash(objUnit: Unit): Base64 {
    if (objUnit.contentHash) {
        return getObjHashB64(getNakedUnit(objUnit));
    }
    const objStrippedUnit: any = {
        alt: objUnit.alt,
        authors: objUnit.authors.map((author) => {
            return {address: author.address};
        }),
        contentHash: getUnitContentHash(objUnit),
        version: objUnit.version,
    };
    if (objUnit.witnessListUnit) {
        objStrippedUnit.witnessListUnit = objUnit.witnessListUnit;
    } else {
        objStrippedUnit.witnesses = objUnit.witnesses;
    }
    if (objUnit.parentUnits) {
        objStrippedUnit.parentUnits = objUnit.parentUnits;
        objStrippedUnit.lastBall = objUnit.lastBall;
        objStrippedUnit.lastBallUnit = objUnit.lastBallUnit;
    }
    return getObjHashB64(objStrippedUnit);
}

export function getUnitHashToSign(objUnit: any): Buffer {
    const objNakedUnit = getNakedUnit(objUnit);
    for (const author of objNakedUnit.authors) {
        delete author.authentifiers;
    }
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

export function getJointHash(joint: Joint): Base64 {
    // we use JSON.stringify, we can't use objectHash here because it might throw errors
    return hash.sha256B64(JSON.stringify(joint));
}

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
