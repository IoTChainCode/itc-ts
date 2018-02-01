import {getAppDataDir} from './desktop';

test('test desktop', () => {
    console.log(process.mainModule);
    console.log(`app data dir: ${getAppDataDir()}`);
});
