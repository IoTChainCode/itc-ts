import {Authentifiers} from './authentifiers';

export default class Author {
    // only when a author sends her first unit from an address(UTXO)
    // her must reveal the address's definition(address is just a hash of definition)

    constructor(
        readonly address: Address,
        readonly authentifiers: Authentifiers,
        readonly definition?: any[],
    ) {
    }
}
