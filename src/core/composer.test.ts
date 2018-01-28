import * as composer from './composer';
import * as conf from '../common/conf';
import {Message, Output} from './message';
import {Signer} from './signer';

test('test genesis composer', async () => {
    let witnesses = [];
    for (let i = 0; i < conf.COUNT_WITNESSES; i++) {
        witnesses.push(i);
    }

    const output = new Output('change add', 0);
    const lastBallMCI = null;

    const inputs = await composer.getInputs(null, 0, null, null);
    console.log(inputs);

    const outputs = composer.getOutputs([output]);
    console.log(outputs);

    const genesisParents = await composer.getParents([]);
    console.log(genesisParents);

    const genesisAuthors = await composer.getAuthors([], null);
    console.log(genesisAuthors);

    const witnessListUnit = await composer.getWitnessListUnit(witnesses, lastBallMCI);
    console.log(witnessListUnit);

    witnesses = await composer.getWitnesses(witnesses);
    console.log(witnesses);

    const message = new Message('payment', 'inline', inputs, outputs);
    console.log(message);

    const signer = new Signer();
    console.log(signer);

    const unit = await composer.composeUnit(witnesses, [], [], outputs, signer);
    console.log(JSON.stringify(unit, null, 2));
});
