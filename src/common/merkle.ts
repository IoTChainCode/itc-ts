import * as hash from './hash';

export type MerkleProof = {
    root: Base64,
    siblings: Base64[],
    index: number,
};

export function getMerkleRoot(elements: any[]): Base64 {
    let hashes = elements.map(hash.sha256B64);
    while (hashes.length > 1) {
        const overHashes = []; // hashes over hashes
        for (let i = 0; i < hashes.length; i += 2) {
            const hashIndex = (i + 1 < hashes.length) ? (i + 1) : i; // for odd number of hashes
            overHashes.push(hash.sha256B64(hashes[i] + hashes[hashIndex]));
        }
        hashes = overHashes;
    }
    return hashes[0];
}

export function getMerkleProof(elements: any[], elementIndex: number): MerkleProof {
    let hashes = elements.map(hash.sha256B64);
    let index = elementIndex;
    const siblings = [];
    while (hashes.length > 1) {
        const overHashes = []; // hashes over hashes
        let overIndex = null;
        for (let i = 0; i < hashes.length; i += 2) {
            const hashIndex = (i + 1 < hashes.length) ? (i + 1) : i; // for odd number of hashes
            if (i === index) {
                siblings.push(hashes[hashIndex]);
                overIndex = i / 2;
            } else if (hashIndex === index) {
                siblings.push(hashes[i]);
                overIndex = i / 2;
            }
            overHashes.push(hash.sha256B64(hashes[i] + hashes[hashIndex]));
        }
        hashes = overHashes;
        if (overIndex === null)
            throw Error('overIndex not defined');
        index = overIndex;
    }
    return {
        root: hashes[0],
        siblings: siblings,
        index: elementIndex,
    };
}

// returns a string element_index-siblings_joined_by_dash-root
export function serializeMerkleProof(proof: MerkleProof): string {
    let serializedProof = `${proof.index}`;
    if (proof.siblings.length > 0)
        serializedProof += '-' + proof.siblings.join('-');
    serializedProof += '-' + proof.root;
    return serializedProof;
}

export function deserializeMerkleProof(serializedProof: string) {
    const arr = serializedProof.split('-');
    const proof: any = {};
    proof.root = arr.pop();
    proof.index = arr.shift();
    proof.siblings = arr;
    return proof;
}

export function verifyMerkleProof(element: any, proof): boolean {
    let index = proof.index;
    let theOtherSibling = hash.sha256B64(element);
    for (let i = 0; i < proof.siblings.length; i++) {
        // this also works for duplicated trailing nodes
        if (index % 2 === 0)
            theOtherSibling = hash.sha256B64(theOtherSibling + proof.siblings[i]);
        else
            theOtherSibling = hash.sha256B64(proof.siblings[i] + theOtherSibling);
        index = Math.floor(index / 2);
    }
    return theOtherSibling === proof.root;
}
