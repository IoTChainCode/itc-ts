import Authentifier from './authentifiers';

export default class Author {
    // only when a author sends her first unit from an address(UTXO)
    // her must reveal the address's definition(address is just a hash of definition)
    definition: any;

    constructor(public address: Address,
                public authentifiers: Authentifier[]) {
    }
}
