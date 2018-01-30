// when a user signs a unit, she must provide
// a set of authentifiers which makes definition of address valid
export default class Authentifier {
    constructor(readonly path: string,
                readonly authentifier: string) {
    }
}
