import * as olength from './object_length';

test('test object length', () => {
    const obj = {
        str: 'oho',
        arr: [1, 2, 3],
        num: 42,
    };

    const len = olength.getLength(obj);
    console.log(len);
});
