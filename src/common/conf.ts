import {getAppDataDir} from './desktop';

export let version = '1.0';
export let alt = '1.0';

export const COUNT_WITNESSES = 12;
export const MAX_WITNESS_LIST_MUTATIONS = 1;
export const TOTAL = 1e15;
export const MAJORITY_OF_WITNESSES =
    (COUNT_WITNESSES % 2 === 0) ? (COUNT_WITNESSES / 2 + 1) : Math.ceil(COUNT_WITNESSES / 2); // 7个major vote
export const COUNT_MC_BALLS_FOR_PAID_WITNESSING = 100;

export const GENESIS_UNIT =
    (alt === '2' && version === '1.0t') ?
        'TvqutGPz3T4Cs6oiChxFlclY92M2MvCvfXR5/FETato=' : 'oj8yEksX9Ubq7lLc+p6F2uyHUuynugeVq4+ikT67X6E=';

export const HASH_LENGTH = 44; // 256-bit hash | base64
export const PUBKEY_LENGTH = 44; // 256-bit hash | base64
export const SIG_LENGTH = 88;

// anti-spam limits
export const MAX_PARENTS_PER_UNIT = 16;
export const MAX_INPUTS_PER_PAYMENT_MESSAGE = 128;
export const MAX_OUTPUTS_PER_PAYMENT_MESSAGE = 128;

export const APP_DATA_DIR = getAppDataDir();
export const KEY_STORE_PATH = `${APP_DATA_DIR}/keystore.json`;
