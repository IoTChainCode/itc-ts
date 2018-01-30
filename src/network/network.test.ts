import Joint from '../core/joint';
import {composeGenesisUnit} from '../core/composer';
import {Network} from './Network';

test('test network', async () => {
    const network1 = new Network();
    network1.start(3000);
    const network2 = new Network();
    network2.start(4000);
    const network3 = new Network();
    network3.start(5000);

    await network1.sendData('ws://localhost:4000', 'hello', 'network2');
    await network2.sendData('ws://localhost:5000', 'hello', 'network2');

    const unit = await composeGenesisUnit();
    const joint = new Joint(unit);
    await network1.broadcastJoint(joint);
});
