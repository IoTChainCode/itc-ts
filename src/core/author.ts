import Authentifier from './authentifiers';

export default class Author {
    constructor(public address: Address,
                public authentifiers: Authentifier[]) {
    }
}
