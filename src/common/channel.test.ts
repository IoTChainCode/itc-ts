import Channel from './channel';

const channel = new Channel();

test('test channel', () => {
    // subscribe
    channel.addListener(data => {
    });

    // dispatch event
    for (let i = 0; i < 100; i++) {
        channel.dispatch(i);
    }
});
