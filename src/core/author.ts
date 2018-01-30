import Authentifier from './authentifiers';

export default class Author {
    definition: any;
    constructor(public address: Address,
                public authentifiers: Authentifier[]) {
    }
}
