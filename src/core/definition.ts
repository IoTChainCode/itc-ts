import * as _ from 'lodash';

export default class Definition {
    static replaceTemplate(templates: any[], params: any) {
        function replaceInVar(x) {
            switch (typeof x) {
                case 'number':
                case 'boolean':
                    return x;
                case 'string':
                    // searching for pattern "$name"
                    if (x.charAt(0) !== '$')
                        return x;
                    const name = x.substring(1);
                    if (!(name in params))
                        throw Error('variable ' + name + ' not specified');
                    return params[name]; // may change type if params[name] is not a string
                case 'object':
                    if (Array.isArray(x))
                        for (let i = 0; i < x.length; i++)
                            x[i] = replaceInVar(x[i]);
                    else
                        for (const key in x)
                            x[key] = replaceInVar(x[key]);
                    return x;
                default:
                    throw Error('unknown type');
            }
        }

        return replaceInVar(_.cloneDeep(templates));
    }
}
