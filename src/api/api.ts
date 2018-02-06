import Wallets from '../wallets/Wallets';
import {default as Wallet} from '../wallets/wallet';
import MyAddresses from '../models/MyAddresses';
import {composeGenesisUnit} from '../core/composer';
import {Peer} from '../network/Peer';

export default class API {
    constructor(readonly wallet: Wallet, readonly address: Address, readonly peer: Peer) {
    }


    static async create(keyPath: string) {
        const wallet = await Wallets.readOrCreate('', keyPath);
        const address = await MyAddresses.issueOrSelectNextAddress(wallet.wallet);
        const peer = new Peer();
        return new API(wallet, address, peer);
    }

    async sendPayment(to: Address, amount: number, witnesses?: Address[]) {
        return this.wallet.sendPayment(to, amount, witnesses);
    }

    async issueGenesis(witnesses: Address[]) {
        const genesisUnit = await composeGenesisUnit(witnesses, this.wallet);
        return this.peer.broadcastUnit(genesisUnit);
    }

    async getBalance() {
        return this.wallet.readBalance();
    }
}
