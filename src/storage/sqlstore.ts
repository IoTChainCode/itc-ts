import * as sqlite from 'sqlite';
import {Database} from 'sqlite';

export interface ISqlStore {
    get(sql: string, ...params: any[]): Promise<any>;

    all(sql: string, ...params: any[]): Promise<any[]>;

    run(sql: string, ...params: any[]): Promise<any>;

    exec(sql: string): Promise<Database>;
}

export class SqliteStore implements ISqlStore {
    private _db: Database;

    async getOrOpen() {
        if (!this._db)
            return this.open();
    }

    async open(filename: string = ':memory:') {
        this._db = await sqlite.open(filename);
        await this._db.migrate({force: 'last', migrationsPath: './src/migrations'});
    }

    async get(sql: string, ...params): Promise<any> {
        await this.getOrOpen()
        return this._db.get(sql, params);
    }

    async all(sql: string, ...params): Promise<any[]> {
        await this.getOrOpen();
        return this._db.all(sql, params);
    }

    async run(sql: string, ...params): Promise<any> {
        await this.getOrOpen();
        return this._db.run(sql, params);
    }

    async exec(sql: string): Promise<Database> {
        await this.getOrOpen();
        return this._db.exec(sql);
    }

    static getUnixTimestamp(date: string) {
        return `strftime('%s', ${date})`;
    }
}

const sqlstore = new SqliteStore();
export default sqlstore;
