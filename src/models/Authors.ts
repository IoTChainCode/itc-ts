import sqlstore from '../storage/sqlstore';
import Authentifier from '../core/authentifiers';
import Author from '../core/author';
import Unit from '../core/unit';
import * as objectHash from '../common/object_hash';
import * as genesis from '../core/genesis';

export class Authors {
    static async read(unit: Base64): Promise<Author[]> {
        const rows = await sqlstore.all(
            'SELECT address, definition_chash FROM unit_authors WHERE unit=? ORDER BY address',
            unit,
        );

        return Promise.all(rows.map(async (row) => {
            const auths = await sqlstore.all(
                'SELECT path, authentifier FROM authentifiers WHERE unit=? AND address=?',
                unit, row.address,
            );

            const authentifiers = auths.map(auth => {
                return new Authentifier(auth.path, auth.authentifier);
            });

            return new Author(row.address, authentifiers);
        }));
    }

    static async save(unit: Unit): Promise<void> {
        const isGenesis = genesis.isGenesisUnit(unit.unit);
        const authorAddresses = [];
        for (let i = 0; i < unit.authors.length; i++) {
            const author = unit.authors[i];
            authorAddresses.push(author.address);
            const definition = author.definition;
            let definitionChash = null;
            if (definition) {
                definitionChash = objectHash.getChash160(definition);
                await sqlstore.run(
                    `INSERT INTO definitions (definition_chash, definition, has_references) VALUES (?,?,?)`,
                    definitionChash, JSON.stringify(definition), 0,
                );
                // actually inserts only when the address is first used.
                // if we change keys and later send a unit signed by new keys, the address is not inserted.
                // Its definition_chash was updated before when we posted change-definition message.
                if (definitionChash === author.address) {
                    await sqlstore.run(`INSERT INTO addresses (address) VALUES(?)`, author.address);
                }
            } else if (unit.contentHash) {
                await sqlstore.run(`INSERT INTO addresses (address) VALUES(?)`, author.address);
            }

            await sqlstore.run(`INSERT INTO unit_authors (unit, address, definition_chash) VALUES(?,?,?)`,
                unit.unit, author.address, definitionChash);
            if (isGenesis)
                await sqlstore.run('UPDATE unit_authors SET _mci=0 WHERE unit=?', unit.unit);
            if (!unit.contentHash) {
                for (const path in author.authentifiers) {
                    await sqlstore.run(`
                        INSERT INTO authentifiers (unit, address, path, authentifier) VALUES(?,?,?,?)`,
                        unit.unit, author.address, path, author.authentifiers[path],
                    );
                }
            }
        }
    }
}


