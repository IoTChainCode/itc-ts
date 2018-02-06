import Wallets from './Wallets';
import * as rimraf from 'rimraf';
import HDKeys from '../common/HDKeys';
import MyAddresses from '../models/MyAddresses';
import XPubKeys from '../models/XPubKeys';

jest.setTimeout(60 * 1000);

test('gen wallets', async () => {
    const tmpDir = './tmp';
    rimraf.sync(tmpDir);

    for (let i = 0; i < 2; i++) {
        const keyPath = `${tmpDir}/key_${i}.json`;
        const key = await HDKeys.readOrCreate('', keyPath);
        const wallet = await Wallets.create(key);
        await MyAddresses.issueOrSelectNextAddress(wallet.wallet);
    }

    console.log(await Wallets.read());
    console.log(await MyAddresses.read());
    console.log(await XPubKeys.all());
});
