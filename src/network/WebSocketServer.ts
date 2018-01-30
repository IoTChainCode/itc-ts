import * as WebSocket from 'ws';
import {ServerOptions} from 'ws';
import * as Koa from 'koa';
import logger from '../common/log';
import * as co from 'co';
import * as http from 'http';
import WebSocketClient from './WebSocketClient';
import compose = require('koa-compose');

interface Context extends Koa.Context {
    ws: WebSocketClient;
    data: any;
}

export default class WebSocketServer extends Koa {
    clients: Set<WebSocketClient> = new Set();
    wss: WebSocket.Server;

    constructor() {
        super();
    }

    async broadcast(data: any) {
        for (const client of this.clients) {
            await client.sendData(data);
        }
    }

    use(fn: (ctx: Context, next: any) => Promise<any>): this {
        return super.use(fn);
    }

    onConnection(ws: WebSocket, req: http.IncomingMessage) {
        const client = new WebSocketClient(ws, req);
        logger.info(`websocket server on connection ${client.url}`);
        this.clients.add(client);
        logger.info(`inbound clients ${this.clients.size}`);
        const ctx = this.createContext(req, null);
        ctx.ws = client;

        const fn = co.wrap(compose(this.middleware));
        ws.on('message', data => {
            ctx.data = data;
            fn(ctx).catch(function (err) {
                logger.error(err);
            });
        });

        ws.on('close', () => {
            logger.info('on close');
            this.clients.delete(client);
        });

        ws.on('error', err => {
            logger.error(err);
        });
    }

    start(wsOptions?: ServerOptions) {
        this.wss = new WebSocket.Server(wsOptions);
        this.wss.on('connection', this.onConnection.bind(this));
    }
}
