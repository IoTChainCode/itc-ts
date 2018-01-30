import WebSocketServer from './WebSocketServer';
import WebSocketClient from './WebSocketClient';
import * as objectHash from '../common/object_hash';
import {readWitnesses} from '../core/witness';
import logger from '../common/log';
import Unit from '../core/unit';

export class Network {
    clients: Map<string, WebSocketClient>;
    server: WebSocketServer;

    constructor() {
        this.clients = new Map();
        this.server = new WebSocketServer();
        this.server.use(async (ctx) => {
            const messages = JSON.parse(ctx.data);
            const type = messages[0];
            const content = messages[1];

            switch (type) {
                case 0:
                    return this.onServerData(ctx.ws, content.subject, content.body);
                case 1:
                    return this.onServerRequest(ctx.ws, content.id, content.command, content.params);
            }
        });
    }

    start(port: number = 3000) {
        this.server.start({port: port});
    }

    async getOrCreateClient(ws: string | WebSocketClient): Promise<WebSocketClient> {
        if (typeof ws === 'string') {
            const url = ws.toLowerCase();
            if (this.clients.has(url)) {
                return this.clients.get(url);
            }
            const client = new WebSocketClient(url);
            await client.open();
            client.onData(data => this.onData(client, data.subject, data.body));
            client.onRequest((id, data) => this.onRequest(client, id, data.command, data.parmas));
            this.clients.set(url, client);
            return client;
        } else {
            return ws;
        }
    }

    async broadcastData(subject: string, body: any) {
        await this.broadcastInboundData(subject, body);
        this.clients.forEach(async (client) => {
            await client.sendData({subject, body});
        });
    }

    async broadcastInboundData(subject: string, body: any) {
        return this.server.broadcast({subject, body});
    }

    async forwardData(ws: WebSocketClient, subject: string, body: any) {
        this.clients.forEach(async (client) => {
            if (client !== ws) {
                await client.sendData({subject, body});
            }
        });

        this.server.clients.forEach(async (client) => {
            if (client !== ws) {
                await client.sendData({subject, body});
            }
        });
    }

    async sendData(ws: string | WebSocketClient, subject: string, body: any) {
        const client = await this.getOrCreateClient(ws);
        return client.sendData({subject, body});
    }

    async sendRequest(ws: string | WebSocketClient, command: string, params: any) {
        const client = await this.getOrCreateClient(ws);
        const request: any = {command: command};
        if (params)
            request.params = params;
        const id = objectHash.getObjHashB64(request);
        return client.sendRequest(request, id);
    }

    async onData(ws: WebSocketClient, subject: string, body: any) {
        console.log(`network receive data ${subject}: ${body}`);
    }

    async onRequest(ws: WebSocketClient, id: string, command: string, params: any) {
        console.log(`network receive request ${id} ${command} ${params}`);
        return ws.sendResponse(id, `response on ${id}`);
    }

    async broadcastUnit(unit: Unit) {
        return this.broadcastData('unit', unit);
    }

    async getWitnesses(ws: string | WebSocketClient) {
        return this.sendRequest(ws, 'get_witnesses', null);
    }

    async onServerData(ws: WebSocketClient, subject: string, body: any) {
        logger.info(`server receive data, subject ${subject}, body ${body}`);
        switch (subject) {
            case 'unit':
                return this.handleUnit(ws, body);
        }
    }

    async onServerRequest(ws: WebSocketClient, id: string, command: string, params: any) {
        logger.info(`server receive request ${id}, command ${command}, params ${params}`);
        switch (command) {
            case 'heartbeat':
                return ws.sendResponse(id, null);

            case 'get_unit':
                const witnesses = await readWitnesses();
                return ws.sendResponse(id, witnesses);
        }
    }

    async handleUnit(ws: WebSocketClient, unit: Unit) {
        // ifOK
        logger.info('server receive unit');
        return this.forwardData(ws, 'unit', unit);
    }
}

const network = new Network();
export default network;
