import * as composer from './composer';
import * as conf from '../common/conf';
import {Signer} from './signer';

test('test genesis composer', async () => {
    const witnesses = [];
    for (let i = 0; i < conf.COUNT_WITNESSES; i++) {
        witnesses.push(i);
    }

    const outputs = [];
    const signer = new Signer();
    const changeAddress = 'changeAddress';
    const unit = await composer.composeUnit(witnesses, [], [], changeAddress, outputs, signer);
    console.log(JSON.stringify(unit, null, 2));
});
