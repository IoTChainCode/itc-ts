import HDKeys from './HDKeys';

test('test hdkeys', async () => {
    const key = await HDKeys.readOrCreate('');
    console.log(key);
});
