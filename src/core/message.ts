import * as objectHash from '../common/object_hash';

export class Input {
    constructor(readonly unit: Base64,
                readonly messageIndex: number,
                readonly outputIndex: number,
                readonly type?: string,
                readonly address?: string) {
    }
}

export type IssueInput = {
    type: 'issue',
    amount: number,
    serialNumber: number,
    address?: string,
};

export class Output {
    constructor(readonly address: Address,
                readonly amount: number) {
    }
}

export type Payload = {
    inputs: Input[],
    outputs: Output[],
};

export class Message {
    readonly payloadHash: string;
    readonly payload: Payload;

    spendProofs: any[];

    constructor(readonly app: string,
                readonly payloadLocation: string,
                inputs: Input[],
                outputs: Output[]) {
        this.payload = {inputs, outputs};
        this.payloadHash = objectHash.getObjHashB64(this.payload);
    }
}
