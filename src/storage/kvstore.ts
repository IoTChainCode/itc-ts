import leveldown from 'leveldown';
import * as levelup from 'levelup';

export interface IKVStore {
    put(key: any, value: any): Promise<any>;

    get(key: any): Promise<any>;

    del(key: any): Promise<any>;
}

class LevelDBStore implements IKVStore {
    private _db: any;

    constructor() {
        this._db = levelup(leveldown('./leveldb'));
    }

    async put(key: any, value: any): Promise<any> {
        return this._db.put(key, value);
    }

    async get(key: any): Promise<any> {
        return this._db.get(key);
    }

    async del(key: any): Promise<any> {
        return this._db.del(key);
    }
}

export const kvstore: IKVStore = new LevelDBStore();
export default kvstore;
