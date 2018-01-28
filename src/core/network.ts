import * as ohash from '../common/object_hash';
import {default as WS, IWebSocket, WebSocketServer} from '../common/websocket';
import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import Joint, {saveJoint} from './joint';
import logger from '../common/log';

enum MessageType {
    request, // await for response
    response,
    justsaying, // just send
}

export interface INetwork {
    getPeers(): Url[];

    sendMessage(ws: IWebSocket, type: MessageType, content: any): Promise<any>;

    sendResponse(ws: IWebSocket, id: string, response: any): Promise<any>;

    sendJustsaying(ws: IWebSocket, subject: string, body: string): Promise<any>;

    handleJustsaying(ws: IWebSocket, subject: string, body: string);

    sendCommand(ws: IWebSocket, command: any, params: any): Promise<any>;

    sendVersion(ws: IWebSocket): Promise<any>;

    getOrConnectWebsocket(url: Url): IWebSocket;

    handleMessage(ws: IWebSocket, message: any);

    broadcastJoint(joint: Joint);

    startAcceptingConnections();
}

type Url = string;

class Network implements INetwork {
    connectingOutboundWebsockets: Map<Url, IWebSocket>;
    knownUrls: Map<Url, boolean>;
    outboundPeers: IWebSocket[];
    wss: any;

    async startAcceptingConnections() {
        this.wss = new WebSocketServer({port: 8088});

        this.wss.on('connection', async (ws) => {
            let ip = ws.upgradeReq.connection.remoteAddress;
            if (!ip) {
                console.log('no ip in accepted connection');
                ws.terminate();
                return;
            }
            if (ws.upgradeReq.headers['x-real-ip'] && (ip === '127.0.0.1' || ip.match(/^192\.168\./))) // we are behind a proxy
                ip = ws.upgradeReq.headers['x-real-ip'];
            ws.peer = ip + ':' + ws.upgradeReq.connection.remotePort;
            ws.host = ip;
            ws.assocPendingRequests = {};
            ws.assocInPreparingResponse = {};
            ws.isInbound = true;
            ws.lastTs = Date.now();
            logger.info(`get connection from ${ws.peer}, host ${ws.host}`);
            if (this.wss.clients.length >= conf.MAX_INBOUND_CONNECTIONS) {
                console.log('inbound connections maxed out, rejecting new client ' + ip);
                ws.close(1000, 'inbound connections maxed out'); // 1001 doesn't work in cordova
                return;
            }

            ws.on('message', null);
            ws.on('close', () => {
                logger.info(`client ${ws.peer} disconnected`);
            });
            ws.on('error', function (e) {
                logger.error('error on client ' + ws.peer + ': ' + e);
                ws.close(1000, 'received error');
            });
            await this.addPeerHost(ws.host);
        });
    }

    async broadcastJoint(joint: Joint) {
        for (const ws of this.outboundPeers) {
            await this.sendJoint(ws, joint);
        }
    }

    async handleJustsaying(ws: IWebSocket, subject: string, body: string) {
        switch (subject) {
            case 'joint':
                const joint = Joint.parseFromJson(body);
                await handleJoint(joint);
        }
    }

    async sendJoint(ws: IWebSocket, joint: Joint, id?: string) {
        return await this.sendResponse(ws, id, {joint: joint});
    }

    async sendResponse(ws: IWebSocket, id: string, response: any): Promise<any> {
        return await this.sendMessage(ws, MessageType.response, {id: id, response: response});
    }

    getPeers(): Url[] {
        return null;
    }


    async sendMessage(ws: IWebSocket, type: MessageType, content: any): Promise<any> {
        const message = JSON.stringify([type, content]);
        return ws.send(message);
    }

    async sendJustsaying(ws: IWebSocket, subject: string, body: any): Promise<any> {
        return this.sendMessage(ws, MessageType.justsaying, {subject, body});
    }

    async sendCommand(ws: IWebSocket, command: any, params: any): Promise<any> {
        const request: any = {command: command};
        if (params) {
            request.params = params;
        }
        request.tag = ohash.getObjHashB64(request);
        const message = JSON.stringify([MessageType.request, request]);
        return ws.sendRequest(message);
    }

    async sendVersion(ws: IWebSocket) {
        const libraryPackageJson = require('./package.json');
        return this.sendJustsaying(ws, 'version', {
            protocol_version: conf.version,
            alt: conf.alt,
            library: libraryPackageJson.name,
            library_version: libraryPackageJson.version,
            program: conf.program,
            program_version: conf.programVersion,
        });
    }

    async handleMessage(ws: IWebSocket, message: any) {
        try {
            const messages = JSON.parse(message);
            const messageType = messages[0];
            const content = messages[1];

            switch (messageType) {
                case 'justsaying':
                    return this.handleJustsaying(ws, content.subject, content.body);
                case 'request':
                    return handleRequest(ws, content.id, content.command, content.params);
                case 'response':
                    return handleResponse(ws, content.tag, content.response);
            }
        } catch (e) {
            throw new Error(`failed to json.parse message ${message}`);
        }
    }

    getOrConnectWebsocket(url: Url): IWebSocket {
        const ws = new WS(url);
        return ws;
    }


    async addPeerHost(host: string) {
        await sqlstore.run('INSERT INTO peer_hosts (peer_host) VALUES (?)', host);
    }


    async addHost(host: string) {
        return await sqlstore.run(`INSERT INTO peers (peer_host, peer) VALUES(?, ?)`, host);
    }

    static getHostByUrl(url: Url): string {
        let matches = url.match(/^wss?:\/\/(.*)$/i);
        if (matches)
            url = matches[1];
        matches = url.match(/^(.*?)[:\/]/);
        return matches ? matches[1] : url;
    }
}

const network: INetwork = new Network();
export default network;

async function handleRequest(ws: IWebSocket, id: string, command: string, params: any) {
    return null;
}

async function handleResponse(ws: IWebSocket, id: string, response: any) {
    return null;
}

async function handleOnlineJoint(ws, joint: Joint) {
    await handleJoint(joint);
}

async function handleJoint(joint: Joint) {
    // add validation;
    await saveJoint(joint, null);
}

