import API from './api';
import {Peer} from '../network/Peer';
import {sleep} from '../common/utils';

jest.setTimeout(1000 * 60);

test('test api', async () => {
    const pool = new Peer();
    pool.listen(3000);

    const nodes: API[] = [];
    for (let i = 0; i < 12; i++) {
        const keyPath = `./tmp/witness${i}.json`;
        const api = await API.create(keyPath);
        api.peer.listen(3001 + i);
        await api.peer.sendMyAddr('ws://localhost:3000');
        nodes.push(api);
    }

    await sleep(1000);

    for (let i = 0; i < 12; i++) {
        await nodes[i].peer.sendGetPeers('ws://localhost:3000');
    }

    const alice = await API.create('./tmp/alice.json');
    await alice.peer.sendGetPeers('ws://localhost:3000');

    const witnesses = nodes.map(x => x.address);
    console.log(witnesses);

    await alice.issueGenesis(witnesses);

    await sleep(1000);
    for (let i = 0; i < 12; i++) {
        const balance = await nodes[i].getBalance();
        console.log(`balance of witness ${i} address ${nodes[i].address}: ${JSON.stringify(balance)}`);
    }

    const bob = await API.create('./tmp/bob.json');
    await nodes[0].sendPayment(bob.address, 10000, witnesses);
    await sleep(1000);
    console.log(await bob.getBalance());

    pool.close();
    alice.peer.close();
    bob.peer.close();
    nodes.forEach(x => x.peer.close());
});
