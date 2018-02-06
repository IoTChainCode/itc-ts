import {composeGenesisUnit} from './composer';
import Wallets from '../wallets/Wallets';
import MyAddresses from '../models/MyAddresses';
import Unit from './unit';
import Units from '../models/Units';
import sqlstore from '../storage/sqlstore';

test('test genesis composer', async () => {
    const witnesses = ['1'];
    const wallet = await Wallets.readOrCreate('');
    await MyAddresses.issueOrSelectNextAddress(wallet.wallet);
    const unit = await composeGenesisUnit(witnesses, wallet);
    console.log(JSON.stringify(unit, null, 2));
    console.log(Unit.validateUnit(unit));

    await Units.save(unit, 'good');
    console.log(await sqlstore.all('select * from units'));
});
