import * as fs from 'fs';
import * as path from 'path';

// app installation dir, this is where the topmost package.json resides
export function getAppRootDir() {
    const mainModuleDir = path.dirname(process.mainModule.paths[0]);
    return getPackageJsonDir(mainModuleDir);
}

// app data dir inside user's home directory
export function getAppDataDir() {
    return (getAppsDataDir() + '/' + getAppName());
}

function getAppsDataDir() {
    switch (process.platform) {
        case 'win32':
            return process.env.LOCALAPPDATA;
        case 'linux':
            return process.env.HOME + '/.config';
        case 'darwin':
            return process.env.HOME + '/Library/Application Support';
        default:
            throw Error(`unknown platform ${process.platform}`);
    }
}

function getPackageJsonDir(startDir: string) {
    try {
        fs.accessSync(startDir + '/package.json');
        return startDir;
    } catch (e) {
        const parentDir = path.dirname(startDir);
        if (parentDir === '/' || process.platform === 'win32' && parentDir.match(/^\w:[\/\\]/))
            throw Error('no package.json found');
        return getPackageJsonDir(parentDir);
    }
}

// read app name from the topmost package.json
function getAppName() {
    const appDir = getAppRootDir();
    console.log('app dir ' + appDir);
    return require(appDir + '/package.json').name;
}
