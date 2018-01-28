import Author from './author';
import {Message} from './message';
import * as objectHash from '../common/object_hash';
import * as objectLength from '../common/object_length';

export default class Unit {
    unit: Base64;
    headersCommission: number;
    payloadCommission: number;
    contentHash?: Base64;
    mainChainIndex?: number;
    timestamp?: number;
    isStable?: boolean;

    earnedHeadersCommissionRecipients: any[];

    constructor(readonly version: string,
                readonly alt: string,
                readonly parentUnits: Base64[],
                readonly lastBall: Base64,
                readonly lastBallUnit: Base64,
                readonly witnessListUnit: Base64,
                readonly authors: Author[],
                readonly witnesses: Address[],
                readonly messages: Message[]) {

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
        this.unit = objectHash.getUnitHash(this);
        return this.unit;
    }
}
