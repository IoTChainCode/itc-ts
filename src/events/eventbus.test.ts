import {TypedEventEmitter} from './eventbus';

class Foo {
    constructor(readonly str: string) {}
}

class Bar {
    constructor(readonly num: number) {}
}

type Routes = {
    foo: Foo;
    bar: Bar;
};

test('test event bus', () => {
    const bus = new TypedEventEmitter<Routes>();
    bus.on('foo', x => console.log(`get foo ${x.str}`));
    bus.once('bar', x => console.log(`get bar ${x.num}`));
    bus.emit('foo', new Foo('hello'));
    bus.emit('bar', new Bar(1));
    bus.emit('bar', new Bar(2));
});
