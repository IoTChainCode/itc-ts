import * as chash from './checksum_hash';

/**
 * True if there is at least one field in obj that is not in arrFields.
 */
export function hasFieldsExcept(obj: any, fields: string[]): boolean {
    for (const field in obj)
        if (fields.indexOf(field) === -1)
            return true;
    return false;
}

/**
 * ES6 Number.isInteger Ponyfill.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger
 */
export function isInteger(value: any): boolean {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

/**
 * True if int is an integer strictly greater than zero.
 */
export function isPositiveInteger(int: any): boolean {
    return (isInteger(int) && int > 0);
}

/**
 * True if int is an integer greater than or equal to zero.
 */
export function isNonnegativeInteger(int: any): boolean {
    return (isInteger(int) && int >= 0);
}

/**
 * True if str is a string and not the empty string.
 */
export function isNonemptyString(str: any): boolean {
    return (typeof str === 'string' && str.length > 0);
}

/**
 * True if str is a string and has length len. False if len not provided.
 */
export function isStringOfLength(str: any, len: number): boolean {
    return (typeof str === 'string' && str.length === len);
}

export function isValidChash(str: any, len: number): boolean {
    return (isStringOfLength(str, len) && chash.isChashValid(str));
}

export function isValidAddressAnyCase(address: Address): boolean {
    return isValidChash(address, 32);
}

export function isValidAddress(address: Address): boolean {
    return (typeof address === 'string' && address === address.toUpperCase() && isValidChash(address, 32));
}

export function isValidDeviceAddress(address: Address): boolean {
    return (isStringOfLength(address, 33) && address[0] === '0' && isValidAddress(address.substr(1)));
}

export function isNonemptyArray(arr: any[]): boolean {
    return (Array.isArray(arr) && arr.length > 0);
}

export function isArrayOfLength(arr: any[], len: number): boolean {
    return (Array.isArray(arr) && arr.length === len);
}

export function isNonemptyObject(obj: any): boolean {
    return (obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length > 0);
}

export function isValidBase64(b64: Base64, len: number): boolean {
    return (b64.length === len && b64 === (new Buffer(b64, 'base64')).toString('base64'));
}
