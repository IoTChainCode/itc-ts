import WebSocketServer from './WebSocketServer';
import WebSocketClient from './WebSocketClient';
import * as objectHash from '../common/object_hash';
import logger from '../common/log';
import {PEER_CONF} from '../common/conf';
import Unit from '../core/unit';
import Units from '../models/Units';
import Witnesses from '../models/Witnesses';
import {MyWitnesses} from '../models/MyWitnesses';

type Endpoint = string | WebSocketClient; // url or an established connection

const MY_ADDR = 'MY_ADDR';
const PING = 'PING';
const GET_PEERS = 'GET_PEERS';
const BROADCAST_UNIT = 'BROADCAST_UNIT';
const GET_WITNESSES = 'GET_WITNESSES';

export class Peer {
    clients: Map<string, WebSocketClient>;
    server: WebSocketServer;
    seeds: string[];
    listenPort: number;
    listenAddr: string;

    constructor() {
        this.clients = new Map();
        this.server = new WebSocketServer();
        this.server.use(async (ctx) => {
            const messages = JSON.parse(ctx.data);
            const type = messages[0];
            const content = messages[1];

            switch (type) {
                case 0:
                    return this.onData(ctx.ws, content.subject, content.body);
                case 1:
                    return this.onRequest(ctx.ws, content.id, content.data.command, content.data.params);
            }
        });
        this.seeds = PEER_CONF.POOL_SEEDS;
    }

    listen(port?: number) {
        port = port || PEER_CONF.LISTEN_PORT;
        this.listenPort = port;
        this.listenAddr = `ws://localhost:${this.listenPort}`;
        logger.info({port}, 'start peer server');
        this.server.start({port: port});
    }

    close() {
        this.server.close();
        this.clients.forEach(x => x.close());
    }

    async connect(ws?: string | WebSocketClient) {
        if (ws) {
            return this.sendRequest(ws, 'get_peers', null);
        } else {
            for (const seed of this.seeds) {
                await this.sendRequest(seed, 'get_peers', null);
            }
        }
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

    async sendData(ws: string | WebSocketClient, subject: string, body?: any) {
        const client = await this.getOrCreateClient(ws);
        return client.sendData({subject, body});
    }

    async sendRequest(ws: string | WebSocketClient, command: string, params?: any) {
        const client = await this.getOrCreateClient(ws);
        const request: any = {command: command};
        if (params)
            request.params = params;
        const id = objectHash.getObjHashB64(request);
        logger.info({request, id}, 'sending request');
        return client.sendRequest(request, id);
    }

    async sendResponse(ws: Endpoint, id: string, data: any) {
        const client = await this.getOrCreateClient(ws);
        return client.sendResponse(id, data);
    }

    async getWitnesses(ws: string | WebSocketClient) {
        return this.sendRequest(ws, 'get_witnesses', null);
    }


    async onData(ws: WebSocketClient, subject: string, body: any) {
        switch (subject) {
            case PING:
                return this.handlePing(ws);
            case MY_ADDR:
                return this.handleMyAddr(ws, body);
            case BROADCAST_UNIT:
                return this.handleBroadcastUnit(ws, body);
            default:
                return logger.warn(`unknown subject ${subject}`);
        }
    }

    async onRequest(ws: WebSocketClient, id: string, command: string, params: any) {
        switch (command) {
            case GET_PEERS:
                return this.handleGetPeers(ws, id);
            default:
                return logger.warn(`unknown command ${command}`);
        }
    }

    async sendGetPeers(ws: Endpoint) {
        logger.info(`${this.listenAddr} sending ${GET_PEERS}`);
        const peers = await this.sendRequest(ws, GET_PEERS);
        logger.info({peers}, `${this.listenAddr} received ${GET_PEERS}`);
        for (const peer of peers) {
            if (peer !== this.listenAddr) {
                await this.sendPing(peer);
            }
        }
    }

    async handleGetPeers(ws: WebSocketClient, id: string) {
        logger.info(`${this.listenAddr} handle ${GET_PEERS}`);
        const outboundPeers = [...this.clients.values()].map(x => x.url);
        return this.sendResponse(ws, id, outboundPeers);
    }

    async broadcastUnit(unit: Unit) {
        logger.info(`${this.listenAddr} sending ${BROADCAST_UNIT}`);
        return this.broadcastData(BROADCAST_UNIT, unit);
    }

    async handleBroadcastUnit(ws: WebSocketClient, unit: Unit) {
        logger.info(unit, `${this.listenAddr} handle ${BROADCAST_UNIT}`);
        const status = await Units.checkUnitStatus(unit.unit);
        switch (status) {
            case 'known':
                return logger.info(unit.unit, 'known unit, ignore');
            case 'unknown':
                const result = Unit.validateUnit(unit);
                switch (result.kind) {
                    case 'ok':
                        logger.info('OK');
                        await Units.save(unit, 'good');
                        return this.forwardData(ws, BROADCAST_UNIT, unit);
                    case 'unit_error':
                        return logger.warn(result, 'validate unit error');
                    default:
                        const _exhaustiveCheck: never = result;
                        return _exhaustiveCheck;
                }
        }
    }

    async sendMyAddr(ws: Endpoint) {
        if (this.listenAddr) {
            logger.info(`${this.listenAddr} sending ${MY_ADDR}`);
            return this.sendData(ws, MY_ADDR, this.listenAddr);
        } else {
            return logger.info('this peer is not listening');
        }
    }

    async handleMyAddr(ws: WebSocketClient, addr: string) {
        logger.info({addr}, `${this.listenAddr} handle ${MY_ADDR}`);
        if (this.clients.has(addr)) {
            return;
        } else {
            logger.info('try to connect the received addr');
            return this.sendPing(addr);
        }
    }

    async sendPing(ws: Endpoint) {
        logger.info(`${this.listenAddr} sending ${PING}`);
        return this.sendData(ws, PING);
    }

    async handlePing(ws: Endpoint) {
        return logger.info(`${this.listenAddr} handle ${PING}`);
    }

    async sendGetWitnesses(ws: Endpoint) {
        logger.info(`${this.listenAddr} sending ${GET_WITNESSES}`);
        const witnesses = await this.sendRequest(ws, GET_WITNESSES);
        logger.info(witnesses, 'sendGetWitnesses');
        return MyWitnesses.insertWitnesses(witnesses);
    }

    async handleGetWitnesses(ws: WebSocketClient, id: string) {
        const witnesses = await MyWitnesses.readWitnesses();
        return this.sendResponse(ws, id, witnesses);
    }
}

const network = new Peer();
export default network;
