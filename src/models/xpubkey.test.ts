import Wallets from '../wallets/Wallets';
import XPubKeys from './XPubKeys';

test('test x pubkey', async() => {
    const wallet = await Wallets.readOrCreate('');
    const pk = await XPubKeys.findByWallet(wallet.wallet);
    console.log(pk);
});
