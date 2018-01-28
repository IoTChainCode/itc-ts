import * as sqlite from 'sqlite';

export async function migrate() {
    const db = await sqlite.open(':memory:');
    await db.migrate({force: 'last', migrationsPath: './src/migrations'});
    return db;
}
