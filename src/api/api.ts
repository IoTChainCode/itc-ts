import Account from '../common/account';
import * as walletManager from '../wallets/wallet_manager';
import wallet from '../wallets/wallet';
import signature from '../common/signature';

export default class API {
    constructor(readonly account: Account) {
    }

    async createWallet() {
        this.account.wallet =
            await walletManager.createWalletByDevices(this.account.hdPublicKey.toString(), this.account.account);
        return this.account.wallet;
    }

    async sendPayment(to: Address, amount: number) {
        const self = this;

        function signWithLocalPrivateKey(wallet, account, isChange, addressIndex, textToSign) {
            const path = `m/44/0/${account}/${isChange}/${addressIndex}`;
            const privateKey = self.account.hdPrivateKey.derive(path).privateKey;
            const privKeyBuf = privateKey.bn.toBuffer({size: 32}); // https://github.com/bitpay/bitcore-lib/issues/47
            return signature.sign(textToSign, privKeyBuf);
        }

        return wallet.sendPayment(
            this.account.wallet, to, amount, null, null, signWithLocalPrivateKey);
    }


    async getBalance() {
        return await wallet.readBalance(this.account.wallet);
    }
}
