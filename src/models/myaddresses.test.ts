import MyAddresses from './MyAddresses';
import Wallets from '../wallets/Wallets';

test('address derivation', async () => {
    const wallet = await Wallets.readOrCreate('');
    console.log(await MyAddresses.read());
    const address = await MyAddresses.issueOrSelectNextAddress(wallet.wallet);
    console.log(address);
    console.log(await MyAddresses.read());
});
