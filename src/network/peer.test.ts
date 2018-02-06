import {Peer} from './Peer';
import {sleep} from '../common/utils';

test('test peers', async () => {
    const peer = new Peer();
    peer.listen(4000);
    const peer2 = new Peer();
    peer2.listen(5000);
    const peer3 = new Peer();
    peer3.listen(6000);


    // peer2 connect to peer1
    await peer2.sendMyAddr('ws://localhost:3000');

    // peer3 request peer1's peers
    await sleep(1000);
    await peer3.sendGetPeers('ws://localhost:3000');

    peer.close();
    peer2.close();
    peer3.close();
});
