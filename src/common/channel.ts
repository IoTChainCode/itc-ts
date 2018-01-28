const innerEvents = [
    'onListenerAdded',
    'onListenerRemoved',
    'onFirstListenerAdded',
    'onLastListenerRemoved',
];

type Callback = (data: any) => void;

export default class Channel {
    private _listeners = [];
    private _mute = false;
    private _accumulate = false;
    private _accumulatedEvents = [];

    constructor(private _name: string = '', private _noInnerEvents: boolean = false) {
        if (!this._noInnerEvents) {
            innerEvents.forEach(eventName => this[eventName] = new Channel(eventName, true));
        }
    }

    /**
     * Add listener for event
     */
    addListener(callback: Callback, context?: any): void {
        this._pushListener(callback, context, false);
    }

    /**
     * Add once listener for event
     */
    addOnceListener(callback, context): void {
        this._pushListener(callback, context, true);
    }

    /**
     * Remove listener from event
     */
    removeListener(callback, context): void {
        this._ensureFunction(callback);
        const index = this._indexOfListener(callback, context);
        if (index >= 0) {
            this._spliceListener(index);
        }
    }

    /**
     * Remove all listeners from channel.
     */
    removeAllListeners(): void {
        while (this.hasListeners()) {
            this._spliceListener(0);
        }
    }

    /**
     * Is listener exist
     */
    hasListener(callback, context): boolean {
        this._ensureFunction(callback);
        return this._indexOfListener(callback, context) >= 0;
    }

    /**
     * Are there any listeners
     */
    hasListeners(): boolean {
        return this._listeners.length > 0;
    }

    /**
     * Call all listeners with specified params
     */
    dispatch(...args) {
        this._invokeListeners({args, async: false});
    }

    /**
     * Call all listeners with specified params asynchronously
     */
    dispatchAsync(...args) {
        this._invokeListeners({args, async: true});
    }

    /**
     * Mute channel
     */
    mute(options: any): void {
        this._mute = true;
        if (options.accumulate) {
            this._accumulate = true;
        } else {
            this._accumulate = false;
            this._accumulatedEvents = [];
        }
    }

    /**
     * Un mute channel
     */
    unmute(): void {
        this._mute = false;
        if (this._accumulate) {
            this._dispatchAccumulated();
            this._accumulate = false;
        }
    }

    _invokeListeners(options = {args: [], async: false}) {
        if (!this._mute) {
            // ToDo: block adding/removing listeners to channel (throw an error) during dispatch operation
            const listenersToInvoke = this._listeners.slice();
            listenersToInvoke.forEach(listener => {
                this._invokeListener(listener, options);
                if (listener.once) {
                    this.removeListener(listener.callback, listener.context);
                }
            });
        } else if (this._accumulate) {
            this._accumulatedEvents.push(options);
        }
    }

    _invokeListener(listener, options) {
        if (options.async) {
            setTimeout(() => listener.callback.apply(listener.context, options.args), 0);
        } else {
            listener.callback.apply(listener.context, options.args);
        }
    }

    /**
     * Ensure function
     */
    _ensureFunction(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Channel ' + this._name + ': listener is not a function');
        }
    }

    /**
     * Dispatch inner events when listener is added
     */
    _dispatchInnerAddEvents() {
        if (!this._noInnerEvents) {
            this['onListenerAdded'].dispatch.apply(this['onListenerAdded'], arguments);
            if (this._listeners.length === 1) {
                this['onFirstListenerAdded'].dispatch.apply(this['onFirstListenerAdded'], arguments);
            }
        }
    }

    /**
     * Dispatch inner events when listener is removed
     * @private
     */
    _dispatchInnerRemoveEvents() {
        if (!this._noInnerEvents) {
            this['onListenerRemoved'].dispatch.apply(this['onListenerRemoved'], arguments);
            if (this._listeners.length === 0) {
                this['onLastListenerRemoved'].dispatch.apply(this['onLastListenerRemoved'], arguments);
            }
        }
    }

    /**
     * Find listener index
     */
    _indexOfListener(callback, context): number {
        let i = -1;
        for (; i < this._listeners.length; i++) {
            const listener = this._listeners[i];
            const equalCallbacks = listener.callback === callback;
            const emptyContexts = context === undefined && listener.context === undefined;
            const equalContexts = context === listener.context;
            if (equalCallbacks && (emptyContexts || equalContexts)) {
                return i;
            }
        }
        return i;
    }

    /**
     * Dispatch accumulated events
     */
    _dispatchAccumulated() {
        this._accumulatedEvents.forEach(options => this._invokeListeners(options));
        this._accumulatedEvents = [];
    }

    /**
     * Pushes listener
     */
    _pushListener(callback, context: object, once: boolean) {
        this._ensureFunction(callback);
        this._listeners.push({callback, context, once});
        this._dispatchInnerAddEvents.apply(this, arguments);
    }

    /**
     * Splice listener under index
     */
    _spliceListener(index: number) {
        const listener = this._listeners[index];
        this._listeners.splice(index, 1);
        const args = [listener.callback];
        if (listener.context) {
            args.push(listener.context);
        }
        this._dispatchInnerRemoveEvents.apply(this, args);
    }
}

class SubscriptionItem {
    private _params: any;
    private _isOn: boolean;

    constructor(params) {
        this._params = params;
        this._isOn = false;
        this._assertParams();
    }

    /**
     * Turn on listener of channel
     */
    on() {
        if (!this._isOn) {
            const {channel} = this._params;
            const method = channel.addListener || channel.addEventListener || channel.on;
            this._applyMethod(method);
            this._isOn = true;
        }
    }

    /**
     * Turn off listener of channel
     */
    off() {
        if (this._isOn) {
            const {channel} = this._params;
            const method = channel.removeListener || channel.removeEventListener || channel.off;
            this._applyMethod(method);
            this._isOn = false;
        }
    }

    _applyMethod(method) {
        const {channel, event, listener} = this._params;
        const args = event ? [event, listener] : [listener];
        method.apply(channel, args);
    }

    _assertParams() {
        const {channel, event, listener} = this._params;
        if (!channel || typeof channel !== 'object') {
            throw new Error('Channel should be object');
        }
        if (event && typeof event !== 'string') {
            throw new Error('Event should be string');
        }
        if (!listener || typeof listener !== 'function') {
            throw new Error('Listener should be function');
        }
    }
}

export class Subscription {
    private _items: SubscriptionItem[];

    constructor(items: any[]) {
        this._items = items.map(params => new SubscriptionItem(params));
    }

    /**
     * Turn on all listeners
     */
    on() {
        this._items.forEach(item => item.on());
        return this;
    }

    /**
     * Turn off all listeners
     */
    off() {
        this._items.forEach(item => item.off());
        return this;
    }
}

export class EventEmitter {
    private _channels: Map<any, Channel>;

    constructor() {
        this._channels = new Map();
    }

    /**
     * Adds listener to specific event
     */
    addListener(event, callback, context) {
        this._getChannel(event).addListener(callback, context);
    }

    /**
     * Adds listener to specific event (alias to addListener)
     */
    on(event, callback, context) {
        this.addListener(event, callback, context);
    }

    /**
     * Adds once listener to specific event
     */
    addOnceListener(event, callback, context) {
        this._getChannel(event).addOnceListener(callback, context);
    }

    /**
     * Adds once listener to specific event (alias to addOnceListener)
     */
    once(event, callback, context) {
        this.addOnceListener(event, callback, context);
    }

    /**
     * Removes listener from specific event
     */
    removeListener(event, callback, context) {
        this._getChannel(event).removeListener(callback, context);
    }

    /**
     * Removes listener from specific event (alias to removeListener)
     */
    off(event, callback, context) {
        this.removeListener(event, callback, context);
    }

    /**
     * Is listener exist for specific event
     */
    hasListener(event, callback, context) {
        return this._getChannel(event).hasListener(callback, context);
    }

    /**
     * Is listener exist for specific event (alias to hasListener)
     */
    has(event, callback, context) {
        return this.hasListener(event, callback, context);
    }

    /**
     * Are there any listeners for specific event
     */
    hasListeners(event) {
        return this._getChannel(event).hasListeners();
    }

    /**
     * Call all listeners for specific event
     */
    dispatch(event, ...args) {
        this._getChannel(event).dispatch(...args);
    }

    /**
     * Call all listeners for specific event
     */
    emit(event, ...args) {
        this.dispatch(event, ...args);
    }

    /**
     * Returns channel by event name
     */
    _getChannel(event: string) {
        if (!this._channels.has(event)) {
            this._channels.set(event, new Channel(event));
        }
        return this._channels.get(event);
    }
}
