import Accounts from './Accounts';

test('test accounts', async() => {
    const account = await Accounts.readOrCreate('dbj');
    console.log(account);
});
