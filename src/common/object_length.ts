import Unit from '../core/unit';

const PARENT_UNITS_SIZE = 2 * 44; // 不管实际上有多少个parents，固定取两个，鼓励取尽量多的parents

export function getHeadersSize(unit: Unit): number {
    if (unit.contentHash)
        throw Error('trying to get headers size of stripped unit');

    const header = {
        'witnesses': unit.witnesses,
        'witnessListUnit': unit.witnessListUnit,
        'authors': unit.authors,
        'version': unit.version,
        'alt': unit.alt,
    };

    return getLength(header) + PARENT_UNITS_SIZE;
}

export function getTotalPayloadSize(unit: Unit): number {
    if (unit.contentHash)
        throw Error('trying to get payload size of stripped unit');
    return getLength(unit.messages);
}

export function getLength(value: any): number {
    if (value === null)
        return 0;
    switch (typeof value) {
        case 'string':
            return value.length;
        case 'number':
            return 8;
        //return value.toString().length;
        case 'object':
            let len = 0;
            if (Array.isArray(value))
                value.forEach(function (element) {
                    len += getLength(element);
                });
            else
                for (const key in value) {
                    if (typeof value[key] === 'undefined')
                        throw Error('undefined at ' + key + ' of ' + JSON.stringify(value));
                    len += getLength(value[key]);
                }
            return len;
        case 'boolean':
            return 1;
        default:
            throw Error('unknown type=' + (typeof value) + ' of ' + value);
    }
}
