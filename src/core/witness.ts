import sqlstore from '../storage/sqlstore';
import * as conf from '../common/conf';
import * as ValidationUtils from '../common/validation_utils';

export async function readWitnesses(): Promise<Address[]> {
    const rows = await sqlstore.all(`SELECT address FROM my_witnesses ORDER BY address`);
    const witnesses = rows.map((row) => row.address);

    if (witnesses.length !== conf.COUNT_WITNESSES)
        throw Error(`wrong number of my witnesses: ${witnesses.length}`);
    return witnesses;
}

export async function replaceWitnesses(oldWitness: Address, newWitness: Address): Promise<Address[]> {
    if (!ValidationUtils.isValidAddress(newWitness))
        throw new Error('new witness address is invalid');

    const witnesses = await readWitnesses();
    if (witnesses.indexOf(oldWitness) === -1) {
        throw new Error('old witness not known');
    }
    if (witnesses.indexOf(newWitness) >= 0) {
        throw new Error('new witness already present');
    }
    return await sqlstore.run('UPDATE my_witnesses SET address=? WHERE address=?', [newWitness, oldWitness]);
}

export async function insertWitnesses(witnesses: Address[]): Promise<Address[]> {
    if (witnesses.length !== conf.COUNT_WITNESSES) {
        throw new Error('attempting to insert wrong number of witnesses: ' + witnesses.length);
    }
    const placeholders = Array.apply(null, Array(witnesses.length)).map(function () {
        return '(?)';
    }).join(',');
    return await sqlstore.run('INSERT INTO my_witnesses (address) VALUES ' + placeholders, witnesses);
}
