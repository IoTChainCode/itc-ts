import sqlstore from '../storage/sqlstore';
import * as objectHash from '../common/object_hash';
import Unit from './unit';
import * as conf from '../common/conf';

type Definition = any;

type SignWithLocalPrivateKey = (wallet: any, account: any, isChange: boolean, addressIndex: number, bufToSign: Buffer) => string;
const signWithLocalPrivateKey: SignWithLocalPrivateKey = null;

export interface ISigner {
    readDefinition(from: Address): Promise<Definition>;

    readSigningPaths(from: Address): Promise<Map<string, number>>;

    sign(unit: any, privatePayloads: any, address: Address, path: any): Promise<string>;

    readPrivateKey(address: Address, path: any): Promise<PrivateKey>;
}

export class Signer implements ISigner {
    async readDefinition(from: Address): Promise<Definition> {
        return await sqlstore.get(`
            SELECT definition FROM my_addresses WHERE address=? 
            UNION 
            SELECT definition FROM shared_addresses WHERE shared_address=?`,
            [from, from],
        );
    }

    async readSigningPaths(from: Address, signingDeviceAddresses: Address[]): Promise<Map<string, number>> {
        const signingPathTypes = await readFullSigningPaths(from, signingDeviceAddresses);
        const signingLengths = new Map<string, number>();
        signingPathTypes.forEach((value, key) => {
            if (value === 'key') {
                signingLengths[key] = conf.SIG_LENGTH;
            } else if (value === 'merkle') {
                signingLengths[key] = 1;
            }
        });

        return signingLengths;
    }

    async sign(unit: Unit, privatePayloads: any, address: Address, path: any): Promise<string> {
        const bufToSign = objectHash.getUnitHashToSign(unit);
        const addressObj = await findAddress(address, path);
        return signWithLocalPrivateKey(addressObj.wallet, addressObj.account, addressObj.is_change, addressObj.address_index, bufToSign);
    }

    readPrivateKey(address: Address, path: any): Promise<PrivateKey> {
        return null;
    }
}

const signer: ISigner = null;
export default signer;


async function findAddress(address: Address, signingPath: any){
    const rows = await sqlstore.all(`
        SELECT wallet, account, is_change, address_index, full_approval_date, device_address
        FROM my_addresses JOIN wallets USING(wallet) JOIN wallet_signing_paths USING(wallet)
        WHERE address=? AND signing_path=?`,
        [address, signingPath],
    );

    const row = rows[0];
    return {
        address: address,
        wallet: row.wallet,
        account: row.account,
        is_change: row.is_change,
        address_index: row.address_index,
    };
}

// returns assoc array signing_path => (key|merkle)
async function readFullSigningPaths(address: Address, signingDeviceAddresses: Address[]): Promise<Map<string, string>> {
    const signingPaths = new Map<string, string>();

    async function goDeeper(memberAddress: Address, pathPrefix: string) {
        let sql = `SELECT signing_path FROM my_addresses JOIN wallet_signing_paths USING(wallet) WHERE address=?`;
        const params = [memberAddress];
        if (signingDeviceAddresses && signingDeviceAddresses.length > 0){
            sql += ` AND device_address IN(?)`;
            params.push(signingDeviceAddresses);
        }
        const rows = await sqlstore.all(sql, params);
        if (rows.length > 0) {
            await Promise.all(rows.map(async(row) => {
                if (row.address === '')  { // merkle
                    return signingPaths[pathPrefix + row.signingPath.substr(1)] = 'merkle';
                } else {
                    return await goDeeper(row.address, pathPrefix + row.signingPath.substr(1));
                }
            }));
        } else {
            signingPaths[pathPrefix] = 'key';
        }
    }

    await goDeeper(address, 'r');
    return signingPaths;
}
