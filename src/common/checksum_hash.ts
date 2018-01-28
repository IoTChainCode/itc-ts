import base32 from './base32';
import * as hash from './hash';

const PI = '14159265358979323846264338327950288419716939937510';
const zeroString = '00000000';

const arrRelativeOffsets = PI.split('');

// 160: RIPEMD160
// 288: sha256(256 bit) + checksum(4 * 8 = 32 bit, [5, 13, 21, 29]) = 288 bit
function checkLength(chashLength: number) {
    if (chashLength !== 160 && chashLength !== 288) {
        throw Error(`unsupported c-hash length: ${chashLength}`);
    }
}

function calcOffsets(chashLength: number) {
    checkLength(chashLength);
    const arrOffsets = [];
    let offset = 0;
    let index = 0;

    for (let i = 0; offset < chashLength; i++) {
        const relativeOffset = parseInt(arrRelativeOffsets[i], 10);
        if (relativeOffset === 0) {
            continue;
        }
        offset += relativeOffset;
        if (chashLength === 288) {
            offset += 4;
        }
        if (offset >= chashLength) {
            break;
        }
        arrOffsets.push(offset);
        index++;
    }

    if (index !== 32) {
        throw Error('wrong number of checksum bits');
    }
    return arrOffsets;
}

const arrOffsets160 = calcOffsets(160);
const arrOffsets288 = calcOffsets(288);

function separateIntoCleanDataAndChecksum(bin: string) {
    const len = bin.length;
    let arrOffsets;
    if (len === 160) {
        arrOffsets = arrOffsets160;
    } else if (len === 288) {
        arrOffsets = arrOffsets288;
    } else {
        throw new Error(`bad length=${len}, bin=${bin}`);
    }
    const arrFrags = [];
    const arrChecksumBits = [];
    let start = 0;
    for (const offset of arrOffsets) {
        arrFrags.push(bin.substring(start, offset));
        arrChecksumBits.push(bin.substr(offset, 1));
        start = offset + 1;
    }
    // add last frag
    if (start < bin.length) {
        arrFrags.push(bin.substring(start));
    }
    const bincleanData = arrFrags.join('');
    const binChecksum = arrChecksumBits.join('');
    return {clean_data: bincleanData, checksum: binChecksum};
}

function mixChecksumIntoCleanData(bincleanData: string, binChecksum: string) {
    if (binChecksum.length !== 32) {
        throw new Error('bad checksum length');
    }
    const len = bincleanData.length + binChecksum.length;
    let arrOffsets;
    if (len === 160) {
        arrOffsets = arrOffsets160;
    } else if (len === 288) {
        arrOffsets = arrOffsets288;
    } else {
        throw new Error(`bad length=${len}, clean data=${bincleanData}, checksum=${binChecksum}`);
    }
    const arrFrags = [];
    const arrChecksumBits = binChecksum.split('');
    let start = 0;
    for (let i = 0; i < arrOffsets.length; i++) {
        const end = arrOffsets[i] - i;
        arrFrags.push(bincleanData.substring(start, end));
        arrFrags.push(arrChecksumBits[i]);
        start = end;
    }
    // add last frag
    if (start < bincleanData.length) {
        arrFrags.push(bincleanData.substring(start));
    }
    return arrFrags.join('');
}

function buffer2bin(buf: Buffer): string {
    const bytes = [];
    for (let i = 0; i < buf.length; i++) {
        let bin = buf[i].toString(2);
        if (bin.length < 8) {
            // pad with zeros
            bin = zeroString.substring(bin.length, 8) + bin;
        }
        bytes.push(bin);
    }
    return bytes.join('');
}

function bin2buffer(bin: string): Buffer {
    const len = bin.length / 8;
    const buf = new Buffer(len);
    for (let i = 0; i < len; i++) {
        buf[i] = parseInt(bin.substr(i * 8, 8), 2);
    }
    return buf;
}

function getChecksum(cleanData: Buffer): Buffer {
    const fullChecksum = hash.sha256(cleanData);
    return new Buffer([fullChecksum[5], fullChecksum[13], fullChecksum[21], fullChecksum[29]]);
}

function getChash(data: string, chashLength: number) {
    checkLength(chashLength);
    const buffer = ((chashLength === 160) ? hash.ripemd160(data) : hash.sha256(data));
    const truncatedHash = (chashLength === 160) ? buffer.slice(4) : buffer; // drop first 4 bytes if 160
    const checksum = getChecksum(truncatedHash);

    const binCleanData = buffer2bin(new Buffer(truncatedHash));
    const binChecksum = buffer2bin(checksum);
    const binChash = mixChecksumIntoCleanData(binCleanData, binChecksum);
    const chash = bin2buffer(binChash);
    return (chashLength === 160) ? base32.encode(chash).toString() : chash.toString('base64');
}

export function getChash160(data: string): string {
    return getChash(data, 160);
}

export function getChash288(data: string): string {
    return getChash(data, 288);
}

// 判断chash是否为合法chash
// RIPEMD160: 160 bit, base32 编码 -> 160/5 = 32Byte
// SHA256 + checksum: 288 bit, base64 编码 -> 288 ／ 6 -> 48Byte
// 验证checksum
export function isChashValid(encoded: string): boolean {
    const encodedLen = encoded.length;
    if (encodedLen !== 32 && encodedLen !== 48) {
        // 160/5 = 32, 288/6 = 48
        throw new Error('wrong encoded length: ' + encodedLen);
    }
    let chash;
    try {
        chash = (encodedLen === 32) ? base32.decode(encoded) : new Buffer(encoded, 'base64');
    } catch (e) {
        return false;
    }
    const binChash = buffer2bin(chash);
    const separated = separateIntoCleanDataAndChecksum(binChash);
    const cleanData = bin2buffer(separated.clean_data);
    const checksum = bin2buffer(separated.checksum);
    return checksum.equals(getChecksum(cleanData));
}
