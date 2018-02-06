import {Peer} from './Peer';

test('test pool', async () => {
    const poolPort = 4000;
    const pool = new Peer();
    pool.listen(poolPort);

    const peer = new Peer();
    try {
        const resp = await peer.sendRequest(`ws://localhost:${poolPort}`, 'get_peers', '');
        console.log(resp);
    } catch (e) {
        console.log(e);
    }

    pool.close();
});
