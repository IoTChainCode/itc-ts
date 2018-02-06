import * as assert from 'assert';
import * as net from 'net';

export class SocketAddress {
    readonly isIPv4;

    constructor(readonly port: number, readonly ipv4?: string, readonly ipv6?: string) {
        assert(ipv4 || ipv6);
        this.isIPv4 = Boolean(ipv4);
    }

    static fromHostPort(host: string, port: number) {
        if (net.isIPv4(host)) {
            return new SocketAddress(port, host);
        } else {
            return new SocketAddress(port, null, host);
        }
    }
}
