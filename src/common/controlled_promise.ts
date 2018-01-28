export default class ControlledPromise {
    private _resolve = null;
    private _reject = null;
    private _isPending = false;
    private _isFulfilled = false;
    private _isRejected = false;
    private _value: any = undefined;
    private _promise: Promise<any> = null;
    private _timer = null;
    private _timeout = 0;
    private _timeoutReason = 'Promise rejected by timeout';

    /**
     * Returns promise itself.
     */
    get promise(): Promise<any> {
        return this._promise;
    }

    /**
     * Returns value with that promise was fulfilled (resolved or rejected).
     */
    get value(): any {
        return this._value;
    }

    /**
     * Returns true if promise is pending.
     */
    get isPending(): boolean {
        return this._isPending;
    }

    /**
     * Returns true if promise is fulfilled.
     */
    get isFulfilled(): boolean {
        return this._isFulfilled;
    }

    /**
     * Returns true if promise rejected.
     */
    get isRejected(): boolean {
        return this._isRejected;
    }

    /**
     * Returns true if promise fulfilled or rejected.
     */
    get isSettled(): boolean {
        return this._isFulfilled || this._isRejected;
    }

    /**
     * Returns true if promise already called via `.call()` method.
     */
    get isCalled(): boolean {
        return this.isPending || this.isSettled;
    }

    /**
     * This method executes `fn` and returns promise. While promise is pending all subsequent calls of `.call(fn)`
     * will return the same promise. To fulfill that promise you can use `.resolve() / .reject()` methods.
     */
    call(fn): Promise<any> {
        if (!this._isPending) {
            this.reset();
            this._createPromise();
            this._callFn(fn);
            this._createTimer();
        }
        return this._promise;
    }

    /**
     * Resolves pending promise with specified `value`.
     */
    resolve(value: any) {
        if (this._isPending) {
            this._resolve(value);
        }
    }

    /**
     * Rejects pending promise with specified `value`.
     */
    reject(value: any) {
        if (this._isPending) {
            this._reject(value);
        }
    }

    /**
     * Resets to initial state.
     */
    reset() {
        if (this._isPending) {
            this.reject(new Error('Promise rejected by reset'));
        }
        this._promise = null;
        this._isPending = false;
        this._isFulfilled = false;
        this._isRejected = false;
        this._value = undefined;
        this._clearTimer();
    }

    /**
     * Sets timeout to reject promise automatically.
     * @param {String|Error|Function} [reason] rejection value. If it is string or error - promise will be rejected with
     * that error. If it is function - this function will be called after delay where you can manually resolve or reject
     * promise via `.resolve() / .reject()` methods.
     */
    timeout(ms: number, reason) {
        this._timeout = ms;
        if (reason !== undefined) {
            this._timeoutReason = reason;
        }
    }

    _createPromise() {
        const internalPromise = new Promise((resolve, reject) => {
            this._isPending = true;
            this._resolve = resolve;
            this._reject = reject;
        });
        this._promise = internalPromise
            .then(value => this._handleFulfill(value), error => this._handleReject(error));
    }

    _handleFulfill(value) {
        this._settle(value);
        this._isFulfilled = true;
        return this._value;
    }

    _handleReject(value) {
        this._settle(value);
        this._isRejected = true;
        return Promise.reject(this._value);
    }

    _handleTimeout() {
        if (typeof this._timeoutReason === 'function') {
            this._timeoutReason();
        } else {
            const error = typeof this._timeoutReason === 'string'
                ? new Error(this._timeoutReason)
                : this._timeoutReason;
            this.reject(error);
        }
    }

    _createTimer() {
        if (this._timeout) {
            this._timer = setTimeout(() => this._handleTimeout(), this._timeout);
        }
    }

    _clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }

    _settle(value) {
        this._isPending = false;
        this._value = value;
        this._clearTimer();
    }

    _callFn(fn) {
        if (typeof fn === 'function') {
            let result;
            try {
                result = fn();
            } catch (e) {
                this.reject(e);
            }
            this._tryAttachToPromise(result);
        }
    }

    _tryAttachToPromise(p) {
        const isPromise = p && typeof p.then === 'function';
        if (isPromise) {
            p.then(value => this.resolve(value), e => this.reject(e));
        }
    }
}
