import * as crypto from 'crypto';

export function ripemd160(data: string | Buffer): Buffer {
    return crypto.createHash('ripemd160').update(data, 'utf8').digest();
}

export function sha256Hex(data: string | Buffer): Hex {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function sha256B64(data: string | Buffer): Base64 {
    return crypto.createHash('sha256').update(data, 'utf8').digest('base64');
}

export function sha256(data: string | Buffer): Buffer {
    return crypto.createHash('sha256').update(data, 'utf8').digest();
}
