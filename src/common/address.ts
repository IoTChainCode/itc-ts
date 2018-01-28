import * as chash from './checksum_hash';

export function deriveAddress(pubKey: PubKey): Address {
    return '0' + chash.getChash160(pubKey);
}
