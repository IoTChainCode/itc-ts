import kvstore from './kvstore';

test('test kvstore', async () => {
    await kvstore.put('testKey', 'testValue');
    const value1 = await kvstore.get('testKey');
    expect(value1.toString()).toBe('testValue');

    let value;
    try {
        value = await kvstore.get('ne');
        console.log(value.toString);
    } catch (e) {
        console.log(e.toString());
    }
});
