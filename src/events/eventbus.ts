export interface Listener<T> {
    (arg: T): any;
}

interface ITypedEventEmitter<T> {
    addListener<K extends keyof T>(event: K, listener: Listener<T[K]>): this;

    on<K extends keyof T>(event: K, listener: Listener<T[K]>): this;

    once<K extends keyof T>(event: K, listener: Listener<T[K]>): this;

    removeListener<K extends keyof T>(event: K, listener: Listener<T[K]>): this;

    removeAllListeners<K extends keyof T>(event?: K): this;

    setMaxListeners(n: number): this;

    getMaxListeners(): number;

    listeners<K extends keyof T>(event: K): Listener<T[K]>[];

    emit<K extends keyof T>(event: K, arg: T[K]): boolean;

    listenerCount<K extends keyof T>(type: K): number;

    eventNames(): (string | symbol)[];
}

export class TypedEventEmitter<T> implements ITypedEventEmitter<T> {
    private _listeners: Map<string, any[]> = new Map();
    private _onceListeners: Map<string, any[]> = new Map();
    private _maxListeners: number;


    addListener<K extends keyof T>(event: K, listener: Listener<T[K]>): this {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(listener);
        return this;
    }


    on<K extends keyof T>(event: K, listener: Listener<T[K]>): this {
        return this.addListener(event, listener);
    }


    once<K extends keyof T>(event: K, listener: Listener<T[K]>): this {
        if (!this._onceListeners.has(event)) {
            this._onceListeners.set(event, []);
        }
        this._onceListeners.get(event).push(listener);
        return this;
    }

    removeListener<K extends keyof T>(event: K, listener: Listener<T[K]>): this {
        if (this._listeners.has(event)) {
            const listeners = this._listeners.get(event);
            const callbackIndex = listeners.indexOf(listener);
            if (callbackIndex > -1) listeners.splice(callbackIndex, 1);
        }
        return this;
    }

    removeAllListeners<K extends keyof T>(event?: K): this {
        if (event === undefined) {
            this._listeners.clear();
            this._onceListeners.clear();
        } else {
            this._listeners.set(event, []);
            this._onceListeners.set(event, []);
        }
        return this;
    }

    setMaxListeners(n: number): this {
        this._maxListeners = n;
        return this;
    }

    getMaxListeners(): number {
        return this._maxListeners;
    }

    listeners<K extends keyof T>(event: K): Listener<T[K]>[] {
        return this._listeners.get(event);
    }

    emit<K extends keyof T>(event: K, arg: T[K]): boolean {
        const listeners = this._listeners.get(event);
        if (listeners !== undefined) {
            listeners.forEach((listener) => listener(arg));
        }

        const onceListeners = this._onceListeners.get(event);
        if (onceListeners !== undefined) {
            onceListeners.forEach((listener) => listener(arg));
            this._onceListeners.set(event, []);
        }

        return true;
    }

    listenerCount<K extends keyof T>(type: K): number {
        return this._listeners.get(type).length;
    }

    eventNames(): (string | symbol)[] {
        return [...this._listeners.keys()];
    }
}
