import Wallets from '../wallets/Wallets';
import MyAddresses from '../models/MyAddresses';
import XPubKeys from '../models/XPubKeys';

test('test signer', async() => {
    const wallet = await Wallets.readOrCreate('');
    const address = await MyAddresses.issueOrSelectNextAddress(wallet.wallet);
    const defs = await wallet.signer.readDefinitions(address);
    console.log(defs);

    console.log(await XPubKeys.all());
    console.log(wallet.key);
    console.log(wallet.key.deriveDeviceAddress());

    const signingPaths = await wallet.signer.readSigningPaths(address, []);
    console.log(signingPaths);
});
