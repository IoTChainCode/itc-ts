import API from './api';
import Account from '../common/account';

test('test api', async () => {
    const account = Account.create();
    const api = new API(account);
    console.log(api);

    const wallet = await api.createWallet();
    console.log(wallet);
});
