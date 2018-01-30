import WebSocketServer from './WebSocketServer';
import WebSocketClient from './WebSocketClient';

test('test web socket client/server', async () => {
    const port = 3000;
    const server = new WebSocketServer();
    server.use(async (ctx) => {
        const messages = JSON.parse(ctx.data);
        const type = messages[0];
        const content = messages[1];

        switch (type) {
            case 0:
                console.log('server on type 0');
                return await ctx.ws.sendData(`received ${content}j`);
            case 1:
                console.log('server on type 1');
                console.log('content', content);
                // return await ctx.ws.sendResponse(content.id, `received req ${content.data}`);
        }
    });

    server.start({port: port});
    const client1 = new WebSocketClient(`ws://localhost:${port}`);
    const client2 = new WebSocketClient(`ws://localhost:${port}`);

    await client1.open();
    client1.onData(async (data) => {
        console.log(`client: on message ${data}`);
    });

    await client1.sendData(`hello`);
    await client2.open();

    await server.broadcast('broadcast');
    const response = await client2.sendRequest('hello req');
    console.log('response: ', response);
});
