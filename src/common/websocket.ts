import Channel, {Subscription} from './channel';
import * as WebSocket from 'ws';
import * as uuid from 'uuid/v4';

import ControlledPromise from './controlled_promise';

export const WebSocketServer = WebSocket.Server;

export interface IWebSocket {
    send(data: any): Promise<void>;

    sendRequest(data: any, options?: any): Promise<any>;

    sendResponse(id: string, data: any): Promise<void>;
}

export const defaultOptions = {
    timeout: 0,
    connectionTimeout: 0,
    packMessage: data => JSON.stringify(data),
    unpackMessage: message => JSON.parse(message),
    // attach requestId to message as `id` field
    attachRequestId: (data, requestId) => Object.assign({id: requestId}, data),
    // read requestId from message `id` field
    extractRequestId: data => data && data.id,
};

// see: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#Ready_state_constants
const STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
};

class WSRequest {
    private _items: Map<string, any>; // requestId -> Promise<response>

    constructor() {
        this._items = new Map();
    }

    async create(requestId: string, fn: any, timeout: number) {
        this._rejectExistingRequest(requestId);
        return this._createNewRequest(requestId, fn, timeout);
    }

    resolve(requestId: string, data: any) {
        if (requestId && this._items.has(requestId)) {
            this._items.get(requestId).resolve(data);
        }
    }

    rejectAll(error?: any) {
        this._items.forEach(request => request.isPending ? request.reject(error) : null);
    }

    _rejectExistingRequest(requestId: string) {
        const existingRequest = this._items.get(requestId);
        if (existingRequest && existingRequest.isPending) {
            existingRequest.reject(new Error(`WebSocket request is replaced, id: ${requestId}`));
        }
    }

    async _createNewRequest(requestId: string, fn: any, timeout: number) {
        const request = new ControlledPromise();
        this._items.set(requestId, request);
        request.timeout(timeout, `WebSocket request was rejected by timeout (${timeout} ms). RequestId: ${requestId}`);
        try {
            await request.call(fn);
        } finally {
            this._deleteRequest(requestId, request);
        }
    }

    _deleteRequest(requestId, request) {
        // this check is important when request was replaced
        if (this._items.get(requestId) === request) {
            this._items.delete(requestId);
        }
    }
}

export default class WS implements IWebSocket {
    private _ws: WebSocket;
    private _options = defaultOptions;
    private _opening: ControlledPromise;
    private _closing: ControlledPromise;
    private _requests: WSRequest;
    private _onMessage: Channel;
    private _onPackedMessage: Channel;
    private _onResponse: Channel;
    private _onClose: Channel;
    private _wsSubscription: any;

    constructor(private _url: string) {
        this._opening = new ControlledPromise();
        this._closing = new ControlledPromise();
        this._requests = new WSRequest();
        this._onMessage = new Channel();
        this._onPackedMessage = new Channel();
        this._onResponse = new Channel();
        this._onClose = new Channel();
        this._ws = null;
        this._wsSubscription = null;
    }

    get ws(): WebSocket {
        return this._ws;
    }

    get isOpening(): boolean {
        return Boolean(this._ws && this._ws.readyState === STATE.CONNECTING);
    }

    get isOpened(): boolean {
        return Boolean(this._ws && this._ws.readyState === STATE.OPEN);
    }

    get isClosing(): boolean {
        return Boolean(this._ws && this._ws.readyState === STATE.CLOSING);
    }

    get isClosed(): boolean {
        return Boolean(!this._ws || this._ws.readyState === STATE.CLOSED);
    }

    get onMessage() {
        return this._onMessage;
    }

    get onPackedMessage() {
        return this._onPackedMessage;
    }

    get onResponse() {
        return this._onResponse;
    }

    get onClose() {
        return this._onClose;
    }

    async open(): Promise<any> {
        if (this.isClosing) {
            return Promise.reject(new Error(`Can't open WebSocket while closing.`));
        }
        if (this.isOpened) {
            return this._opening.promise;
        }
        return this._opening.call(() => {
            const timeout = this._options.connectionTimeout || this._options.timeout;
            this._opening.timeout(timeout, `Can't open WebSocket within allowed timeout: ${timeout} ms.`);
            this._opening.promise.catch(e => this._cleanup(e));
            this._createWS();
        });
    }

    async send(data: any): Promise<any> {
        if (this.isOpened) {
            this._ws.send(data);
        } else {
            throw new Error(`Can't send data because WebSocket is not opened.`);
        }
    }

    async sendRequest(data: any, options: any = {}) {
        const requestId = options.requestId || `${uuid()}`;
        const timeout = options.timeout !== undefined ? options.timeout : this._options.timeout;
        return this._requests.create(requestId, async () => {
            this._assertRequestIdHandlers();
            const finalData = this._options.attachRequestId(data, requestId);
            await this.sendPacked(finalData);
        }, timeout);
    }

    sendResponse(id: string, data: any): Promise<void> {
        const requestId = id;
        const timeout = this._options.timeout;
        return this._requests.create(requestId, async () => {
            this._assertRequestIdHandlers();
            const finalData = this._options.attachRequestId(data, requestId);
            await this.sendPacked(finalData);
        }, timeout);
    }

    async sendPacked(data: any) {
        this._assertPackingHandlers();
        const message = this._options.packMessage(data);
        return this.send(message);
    }

    /**
     * Closes WebSocket connection. If connection already closed, promise will be resolved with "close event".
     */
    close() {
        if (this.isClosed) {
            return Promise.resolve(this._closing.value);
        }
        return this._closing.call(() => {
            const {timeout} = this._options;
            this._closing.timeout(timeout, `Can't close WebSocket within allowed timeout: ${timeout} ms.`);
            this._ws.close();
        });
    }

    _createWS() {
        this._ws = new WebSocket(this._url);
        this._wsSubscription = new Subscription([
            {channel: this._ws, event: 'open', listener: e => this._handleOpen(e)},
            {channel: this._ws, event: 'message', listener: e => this._handleMessage(e)},
            {channel: this._ws, event: 'error', listener: e => this._handleError(e)},
            {channel: this._ws, event: 'close', listener: e => this._handleClose(e)},
        ]).on();
        this._ws.setMaxListeners(20);
    }

    _handleOpen(event) {
        this._opening.resolve(event);
    }

    _handleMessage(event) {
        const message = event.data;
        this._onMessage.dispatchAsync(message);
        this._handleUnpackedMessage(message);
    }

    _handleUnpackedMessage(message) {
        if (this._options.unpackMessage) {
            const data = this._options.unpackMessage(message);
            if (data !== undefined) {
                this._onPackedMessage.dispatchAsync(data);
                this._handleResponse(data);
            }
        }
    }

    _handleResponse(data) {
        if (this._options.extractRequestId) {
            const requestId = this._options.extractRequestId(data);
            if (requestId) {
                this._onResponse.dispatchAsync(data, requestId);
                this._requests.resolve(requestId, data);
            }
        }
    }

    _handleError(err: Error) {
        console.log(err);
        // currently no specific handling of this event
    }

    _handleClose(event) {
        this._onClose.dispatchAsync(event);
        this._closing.resolve(event);
        const error = new Error(`WebSocket closed with reason: ${event.reason} (${event.code}).`);
        if (this._opening.isPending) {
            this._opening.reject(error);
        }
        this._cleanup(error);
    }

    _cleanupWS() {
        if (this._wsSubscription) {
            this._wsSubscription.off();
            this._wsSubscription = null;
        }
        this._ws = null;
    }

    _cleanup(error?: any) {
        this._cleanupWS();
        this._requests.rejectAll(error);
    }

    _assertPackingHandlers() {
        if (!this._options.packMessage || !this._options.unpackMessage) {
            throw new Error(`Please define 'options.packMessage / options.unpackMessage' for sending packed messages.`);
        }
    }

    _assertRequestIdHandlers() {
        if (!this._options.attachRequestId || !this._options.extractRequestId) {
            throw new Error(`Please define 'options.attachRequestId / options.extractRequestId' for sending requests.`);
        }
    }
}
