import device from '../core/device';

async function sendPrivatePayments(to: Address, chains: any[], forwarded: boolean) {
    const body: any = {chains};
    if (forwarded) {
        body.forwarded = forwarded;
    }
    return device.sendMessageToDevice(to, 'private_payments', body);
}
