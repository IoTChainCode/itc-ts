import WS from './websocket';
import * as WebSocket from 'ws';

test('test websocket', async () => {
    const wss = new WebSocket.Server({port: 8888});
    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            console.log(`received: ${message}`);
        });
    }).on('error', (err) => {
        console.log(err);
    });

    const ws = new WS('ws://localhost:8888');
    ws.onMessage.addListener((e) => {
        console.log(`on message... ${e}`);
    });

    ws.onClose.addListener(() => {
        console.log(`on closing...`);
    });

    ws.onPackedMessage.addListener(() => {
        console.log(`on package message...`);
    });

    ws.onResponse.addListener(() => {
        console.log(`on response ...`);
    });

    await ws.open();
    await ws.send('hello');
    const resp = await ws.sendRequest({foo: 'hello, what is your name?'});
    console.log(resp);
});
