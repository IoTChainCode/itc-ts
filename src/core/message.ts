import * as objectHash from '../common/object_hash';

export type Input = IssueInput | TransferInput | HeaderInput | WitnessInput;

export type TransferInput = {
    type: 'transfer',
    unit: Base64,
    messageIndex: number,
    outputIndex: number,
};

export type IssueInput = {
    type: 'issue',
    amount: number,
    serialNumber: number,
    address?: string,
};

export type HeaderInput = {
    type: 'headers_commission',
    fromMCI: number,
    toMCI: number,
};

export type WitnessInput = {
    type: 'witness_commission',
    fromMCI: number,
    toMCI: number,
};

export class Output {
    constructor(
        readonly address: Address,
        readonly amount: number,
    ) {
    }
}

export type Payload = {
    inputs: Input[],
    outputs: Output[],
};

export class Message {
    readonly payloadHash: string;
    readonly payload: Payload;

    constructor(
        readonly app: string,
        readonly payloadLocation: string,
        inputs: Input[],
        outputs: Output[],
    ) {
        this.payload = {inputs, outputs};
        this.payloadHash = objectHash.getObjHashB64(this.payload);
    }

    static newPaymentMessage(inputs: Input[], outputs: Output[]): Message {
        return new Message('payment', 'inline', inputs, outputs);
    }
}
