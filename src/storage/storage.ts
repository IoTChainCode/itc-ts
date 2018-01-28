import {default as Unit} from '../core/unit';
import sqlstore from './sqlstore';
import * as conf from '../common/conf';
import * as objectHash from '../common/object_hash';
import * as _ from 'lodash';
import Base64 = require('crypto-js/enc-base64');

export interface IStorage {
    readStaticUnitProps(unit: string): Promise<any>;

    readPropsOfUnits(earlierUnit: string, laterUnits: any[]);

    readUnitProps(unit: Base64): Promise<any>;

    readUnitAuthors(unit: string): Promise<Address[]>;

    determineWitnessedLevelAndBestParent(parentUnits: string[], witnesses: Address[]);

    readWitnesses(unit: Base64);
}

class Storage implements IStorage {
    private _cachedUnits: Map<string, any>;
    private _cachedUnitAuthors: Map<string, any[]>;

    cachedUnitWitnesses = new Map<Base64, Address[]>();
    unstableUnits = new Map<string, Unit>();
    stableUnits = new Map<string, Unit>();

    constructor() {
        this._cachedUnits = new Map();
        this._cachedUnitAuthors = new Map();
    }

    async readJoint(unit: Base64) {
        if (!conf.bSaveJointJson)
            return readJointDirectly(conn, unit, callbacks);
        conn.query('SELECT json FROM joints WHERE unit=?', [unit], function (rows) {
            if (rows.length === 0)
                return readJointDirectly(conn, unit, callbacks);
            callbacks.ifFound(JSON.parse(rows[0].json));
        });
    }

    async readWitnesses(unit: Base64): Promise<Address[]> {
        const witnesses = this.cachedUnitWitnesses[unit];
        return witnesses;
    }

    async readStaticUnitProps(unit: string) {
        const props = this._cachedUnits[unit];
        if (props)
            return Promise.resolve(props);

        const row = await sqlstore.get(`
            SELECT level, witnessed_level, best_parent_unit, witness_list_unit FROM units where unit=?`, [unit]);
        this._cachedUnits[unit] = row;
        return row;
    }

    async readPropsOfUnits(earlierUnit: string, laterUnits: any[]) {
        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain, is_free FROM units WHERE unit IN(?, ?)`,
            [earlierUnit, laterUnits],
        );
        let earlierUnitProps;
        const laterUnitProps = [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].unit === earlierUnit)
                earlierUnitProps = rows[i];
            else
                laterUnitProps.push(rows[i]);
        }
        return [earlierUnitProps, laterUnitProps];
    }

    async readUnitProps(unit: Base64): Promise<any> {
        if (this.stableUnits[unit])
            return this.stableUnits[unit];
        const rows = await sqlstore.all(`
            SELECT unit, level, latest_included_mc_index, main_chain_index, is_on_main_chain, is_free, is_stable, witnessed_level 
            FROM units WHERE unit=?`,
            [unit],
        );
        const props = rows[0];
        if (props.is_stable)
            this.stableUnits[unit] = props;
        else {
            const props2 = _.cloneDeep(this.unstableUnits[unit]);
            if (!props2)
                throw Error('no unstable props of ' + unit);
            delete props2.parent_units;
            if (!_.isEqual(props, props2))
                throw Error(`different props of ${unit}`);
        }
        return props;
    }

    async readUnitAuthors(unit: string): Promise<Address[]> {
        const authors = this._cachedUnitAuthors[unit];
        if (authors)
            return authors;
        const rows = await sqlstore.all(`SELECT address FROM unit_authors WHERE unit=?`, [unit]);
        const sorted = rows.map(row => row.address).sort();
        this._cachedUnitAuthors[unit] = sorted;
        return sorted;
    }

    async determineWitnessedLevelAndBestParent(parentUnits: string[], witnesses: Address[]) {
        const collectedWitnesses = [];
        let myBestParentUnit;

        async function addWitnessesAndGoUp(startUnit: string) {
            const props = await storage.readStaticUnitProps(startUnit);
            const bestParentUnit = props.bestParentUnit;
            const level = props.level;
            if (level === 0) // genesis
                return [0, myBestParentUnit];

            const authors = await storage.readUnitAuthors(startUnit);
            for (let i = 0; i < authors.length; i++) {
                const address = authors[i];
                if (witnesses.indexOf(address) !== -1 && collectedWitnesses.indexOf(address) === -1) {
                    collectedWitnesses.push(address);
                }
            }
            if (collectedWitnesses.length < conf.MAJORITY_OF_WITNESSES) {
                return await addWitnessesAndGoUp(bestParentUnit);
            } else {
                return [level, myBestParentUnit];
            }
        }

        const bestParentUnit = await this.determineBestParent({
            parent_units: parentUnits,
            witness_list_unit: 'none',
        }, witnesses);
        myBestParentUnit = bestParentUnit;
        return await addWitnessesAndGoUp(bestParentUnit);
    }

    // for unit that is not saved to the db yet
    async determineBestParent(unit: any, witnesses: Address[]) {
        // choose best parent among compatible parents only
        const rows = sqlstore.all(`
        SELECT unit FROM units AS parent_units
        WHERE unit IN(?)
        AND (witness_list_unit=? OR (
            SELECT COUNT(*)
        FROM unit_witnesses AS parent_witnesses
        WHERE parent_witnesses.unit IN(parent_units.unit, parent_units.witness_list_unit) AND address IN(?)
        )>=?)
        ORDER BY witnessed_level DESC
        level-witnessed_level ASC
        unit ASC
        LIMIT 1`,
            [unit.parentUnits, unit.witnessListUnit,
                witnesses, conf.COUNT_WITNESSES - conf.MAX_WITNESS_LIST_MUTATIONS],
        );
        return rows[0].unit;
    }

    async findWitnessListUnit(witnesses: Address[], lastBallMCI: number): Promise<Base64> {
        const rows = await sqlstore.all(`
            SELECT witness_list_hashes.witness_list_unit
            FROM witness_list_hashes CROSS JOIN units ON witness_list_hashes.witness_list_unit=unit
            WHERE witness_list_hash=? AND sequence='good' AND is_stable=1 AND main_chain_index<=?`,
            [objectHash.getObjHashB64(witnesses), lastBallMCI],
        );
        return (rows.length === 0) ? null : rows[0].witness_list_unit;
    }
}

const storage = new Storage();
export default storage;



