import {Network} from './Network';
import * as composer from '../core/composer';
import * as conf from '../common/conf';
import {Signer} from '../core/signer';

test('test network', async () => {
    const network1 = new Network();
    network1.start(3000);
    const network2 = new Network();
    network2.start(4000);
    const network3 = new Network();
    network3.start(5000);

    await network1.sendData('ws://localhost:4000', 'hello', 'network2');
    await network2.sendData('ws://localhost:5000', 'hello', 'network2');

    const witnesses = [];
    for (let i = 0; i < conf.COUNT_WITNESSES; i++) {
        witnesses.push(i);
    }

    const outputs = [];
    const signer = new Signer();
    const changeAddress = 'changeAddress';
    const unit = await composer.composeUnit(witnesses, [], [], changeAddress, outputs, signer);
    await network1.broadcastUnit(unit);
});
