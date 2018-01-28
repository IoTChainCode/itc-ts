import * as hash from './hash';
test('test hash', () => {
    const text = 'oho';
    expect(hash.sha256B64(text).length).toBe(44);
    expect(hash.sha256Hex(text).length).toBe(64);
});
