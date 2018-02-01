import Wallets from './Wallets';

test('test wallets', async () => {
    const wallet1 = await Wallets.readOrCreate('dbj');
    console.log(wallet1);
});
