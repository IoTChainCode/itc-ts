import * as WebSocket from 'ws';
import ControlledPromise from '../common/ControlledPromise';
import logger from '../common/log';
import * as uuid from 'uuid/v4';
import * as http from 'http';
import timeoutPromise from '../common/timeoutPromise';

const defaultOptions = {
    timeout: 60,
    connectionTimeout: 0,
};

const STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
};

enum MessageType {
    data, // just sending data
    request, // send and await response
    response, // must contains requestId
}

interface IPromise {
    resolve;
    reject;
}

class Request {
    private _promises: Map<string, IPromise>;

    constructor() {
        this._promises = new Map();
    }

    async create(id: string, fn: (...params: any[]) => Promise<void>, timeout: number): Promise<any> {
        return timeoutPromise(new Promise(async (resolve, reject) => {
            await fn();
            this._promises.set(id, {resolve, reject});
        }), timeout);
    }

    resolve(id: string, data: any) {
        if (this._promises.has(id)) {
            this._promises.get(id).resolve(data);
        }
    }

    rejectAll(error?: any) {
        this._promises.forEach(promise => promise.reject(error));
    }
}

export default class WebSocketClient {
    private _url: string;
    private _ws: WebSocket;
    private _remoteAddress: string;
    private _remotePort: number;
    private _options = defaultOptions;
    private _opening: ControlledPromise;
    private _closing: ControlledPromise;
    private _request: Request;

    private _handleData = (data: any) => {
        // do nothing
    };

    private _handleRequest = (id: string, data: any) => {
        // donothing
    };

    constructor(ws: string | WebSocket, req?: http.IncomingMessage) {
        if (typeof ws === 'string') {
            this._url = ws;
        } else {
            this._ws = ws;
        }

        if (req) {
            this._remoteAddress = req.connection.remoteAddress;
            this._remotePort = req.connection.remotePort;
            this._url = `${this._remoteAddress}:${this._remotePort}`;
        }

        this._opening = new ControlledPromise();
        this._closing = new ControlledPromise();
        this._request = new Request();
    }

    onData(fn: (data: any) => Promise<void>) {
        this._handleData = fn;
    }

    onRequest(fn: (id: string, data: any) => Promise<any>) {
        this._handleRequest = fn;
    }

    get url(): string {
        return this._url;
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

    private async _send(data: any): Promise<void> {
        if (this.isOpened) {
            this._ws.send(data);
        } else {
            throw new Error(`Can't send data because WebSocket is not opened.`);
        }
    }

    async sendData(data: any): Promise<void> {
        const message = JSON.stringify([MessageType.data, data]);
        return this._send(message);
    }

    async sendRequest(data: any, id?: string, timeout?: number): Promise<any> {
        id = id || `${uuid()}`;
        timeout = timeout || this._options.timeout;
        return this._request.create(id, async () => {
            const message = JSON.stringify([MessageType.request, {id: id, data: data}]);
            return this._send(message);
        }, timeout);
    }

    async sendResponse(id: string, data: any): Promise<void> {
        const message = JSON.stringify([MessageType.response, {id: id, data: data}]);
        return this._send(message);
    }

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
        this._ws.on('open', e => this._handleOpen(e));
        this._ws.on('message', e => this._handleMessage(e));
        this._ws.on('error', e => this._handleError(e));
        this._ws.on('close', e => this._handleClose(e));
    }

    _handleOpen(event) {
        this._opening.resolve(event);
    }

    async _handleMessage(event) {
        const messages = JSON.parse(event);
        const type = messages[0];
        const content = messages[1];
        switch (type) {
            case MessageType.data:
                return this._handleData(content);
            case MessageType.request:
                return this._handleRequest(content.id, content.data);
            case MessageType.response:
                return this._handleResponse(content.id, content.data);
        }
    }

    async _handleResponse(id: string, data: any) {
        return this._request.resolve(id, data);
    }

    _handleError(err: Error) {
        logger.error(`error on ${this._url}, ${err}`);
    }

    _handleClose(event) {
        this._closing.resolve(event);
        const error = new Error(`WebSocket closed with reason: ${event.reason} (${event.code}).`);
        if (this._opening.isPending) {
            this._opening.reject(error);
        }
        this._cleanup(error);
    }

    _cleanupWS() {
        this._ws = null;
    }

    _cleanup(error?: any) {
        this._cleanupWS();
        this._request.rejectAll(error);
    }
}

