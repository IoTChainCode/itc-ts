import {default as sqlstore} from './sqlstore';

test('test sqlstore', async () => {
    const row = await sqlstore.get(`SELECT 1`);
    console.log(row['1']);
});
