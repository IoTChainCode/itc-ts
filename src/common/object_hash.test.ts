import * as ohash from './object_hash';

test('test object hash', () => {
    const obj = {
        'key': 'oho',
    };
    const hash = ohash.getObjHashB64(obj);
    console.log(hash);
});
