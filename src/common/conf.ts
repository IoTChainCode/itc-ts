export let version = '1.0';
export let alt = '1.0';
export let program = '';
export let programVersion = '';

//
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
export const MAX_AUTHORS_PER_UNIT = 16;
export const MAX_PARENTS_PER_UNIT = 16;
export const MAX_MESSAGES_PER_UNIT = 128;
export const MAX_SPEND_PROOFS_PER_MESSAGE = 128;
export const MAX_INPUTS_PER_PAYMENT_MESSAGE = 128;
export const MAX_OUTPUTS_PER_PAYMENT_MESSAGE = 128;
export const MAX_CHOICES_PER_POLL = 128;
export const MAX_DENOMINATIONS_PER_ASSET_DEFINITION = 64;
export const MAX_ATTESTORS_PER_ASSET = 64;
export const MAX_DATA_FEED_NAME_LENGTH = 64;
export const MAX_DATA_FEED_VALUE_LENGTH = 64;
export const MAX_AUTHENTIFIER_LENGTH = 4096;
export const MAX_CAP = 9e15;
export const MAX_COMPLEXITY = 100;
export const TEXTCOIN_CLAIM_FEE = 548;
export const TEXTCOIN_ASSET_CLAIM_FEE = 750;

export const WS_PROTOCOL = 'wss://';
export const MAX_INBOUND_CONNECTIONS = 100;
export const MAX_OUTBOUND_CONNECTIONS = 100;
export const MAX_TOLERATED_INVALID_RATIO = 0.1; // max tolerated ratio of invalid to good joints
export const MIN_COUNT_GOOD_PEERS = 10; // if we have less than this number of good peers, we'll ask peers for their lists of peers
export const wantNewPeers = true;
