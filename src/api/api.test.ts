import API from './api';

test('test api', async () => {
    const api = await API.fromPassphrase('dbj');
    console.log(api);
});
