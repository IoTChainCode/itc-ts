import {IWebSocket} from '../common/websocket';
import {default as network} from './network';
import {readWitnesses} from './witness';
import * as conf from '../common/conf';
import * as address from '../common/address';
import sqlstore from '../storage/sqlstore';

type Request = {
    id: string,
    route: string,
    content: string,
};

async function handleJustsaying(ws: IWebSocket, subject: string, body: any) {
}

async function handleRequest(ws: IWebSocket, request: Request) {
    switch (request.route) {
        case '/get_peers':
            return network.sendResponse(ws, request.id, network.getPeers());

        case '/get_witnesses':
            const witnesses = await readWitnesses();
            return ws.sendResponse(request.id, witnesses);

        case '/hub/get_ephemeral_pubkey':
            const permanentPubKey = request.content;
            if (!permanentPubKey) {
                return network.sendErrorResponse(ws, request.id, 'no permanent pubkey');
            }
            if (permanentPubKey.length !== conf.PUBKEY_LENGTH) {
                return network.sendErrorResponse(ws, request.id, 'wrong permanent pubkey length');
            }
            const deviceAddress = address.deriveAddress(permanentPubKey);
            const rows = await sqlstore.all(`SELECT temp_pubkey_package FROM devices WHERE device_address=?`, [deviceAddress]);
            if (rows.length === 0) {
                return network.sendErrorResponse(ws, request.id, 'device with this pubkey is not registered here');
            }
            return network.sendResponse(ws, request.id, rows[0]);
    }
}
