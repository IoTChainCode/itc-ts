import sqlstore from '../storage/sqlstore';
import * as objectHash from '../common/object_hash';
import Unit from './unit';
import * as conf from '../common/conf';
import Signature from '../common/Signature';

type Definition = string;

export class Signer {
    constructor(readonly xPrivKey) {
    }

    signWithLocalPrivateKey(wallet: string,
                                  account: number,
                                  isChange: number,
                                  addressIndex: number,
                                  buffer: Buffer) {
        const derived = this.xPrivKey
            .derive(44, true)
            .derive(0, true)
            .derive(account, true)
            .derive(isChange)
            .derive(addressIndex)
            .privateKey;

        const privKeyBuf = derived.bn.toBuffer({size: 32}); // https://github.com/bitpay/bitcore-lib/issues/47
        return Signature.sign(buffer, privKeyBuf);
    }

    async readDefinitions(address: Address): Promise<Definition[]> {
        return await sqlstore.get(`
            SELECT definition FROM my_addresses WHERE address=? 
            UNION 
            SELECT definition FROM shared_addresses WHERE shared_address=?`,
            [address, address],
        );
    }

    async readSigningPaths(address: Address, signingDeviceAddresses: Address[]): Promise<Map<string, number>> {
        const signingPathTypes = await readFullSigningPaths(address, signingDeviceAddresses);
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

    async sign(unit: Unit, address: Address, path: any): Promise<string> {
        const bufToSign = objectHash.getUnitHashToSign(unit);
        const addressObj = await findAddress(address, path);
        return this.signWithLocalPrivateKey(
            addressObj.wallet, addressObj.account, addressObj.is_change, addressObj.address_index, bufToSign);
    }
}

async function findAddress(address: Address, signingPath: any) {
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

// returns a map of signing_path => (key|merkle)
async function readFullSigningPaths(address: Address, signingDeviceAddresses: Address[]): Promise<Map<string, string>> {
    const signingPaths = new Map<string, string>();

    async function goDeeper(memberAddress: Address, pathPrefix: string) {
        let sql = `SELECT signing_path FROM my_addresses JOIN wallet_signing_paths USING(wallet) WHERE address=?`;
        const params: any[] = [memberAddress];
        if (signingDeviceAddresses && signingDeviceAddresses.length > 0) {
            sql += ` AND device_address IN(?)`;
            params.push(signingDeviceAddresses);
        }
        const rows = await sqlstore.all(sql, params);
        if (rows.length > 0) {
            await Promise.all(rows.map(async (row) => {
                if (row.address === '') { // merkle
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
