import Wallets from '../wallets/Wallets';
import {default as Wallet} from '../wallets/wallet';

export default class API {

    constructor(readonly wallet: Wallet) {
    }

    static async fromPassphrase(passphrase: string) {
        const wallet = await Wallets.readOrCreate(passphrase);
        return new API(wallet);
    }

    async sendPayment(to: Address, amount: number) {
        return this.wallet.sendPayment(to, amount);
    }

    async getBalance() {
        return this.wallet.readBalance();
    }
}
