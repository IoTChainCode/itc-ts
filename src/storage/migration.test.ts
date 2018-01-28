import {migrate} from './migration';

test('database migration', async () => {
    const db = await migrate();
    console.log(db);
});
