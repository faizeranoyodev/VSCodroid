'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const patch = fs.readFileSync('patches/0029-copilot-package-dependencies-after-build.patch', 'utf8');
const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++') || line.startsWith(' '))
    .map(line => line.slice(1)).join('\n');
const body = added.slice(added.indexOf('\tconst result = es.through();'), added.indexOf('\n}', added.indexOf('\tconst result = es.through();')));
const stream = () => new PassThrough({ objectMode: true });
async function fixture({ empty = false, failure = false } = {}) {
    const local = stream();
    let sdkReady = false;
    let scanned = false;
    const output = vm.runInNewContext('(function() {' + body + '})()', {
        es: { through: stream }, localExtensionsStream: local, path, process, root: '/source',
        getProductionDependencies() { assert.equal(sdkReady, true); return empty ? [] : ['/source/extensions/copilot/node_modules/@github/copilot']; },
        gulp: { src() {
            scanned = true;
            const files = stream();
            setImmediate(() => {
                if (failure) files.emit('error', new Error('dependency read failed'));
                else files.end({ path: 'sdk/index.js', contents: 'complete SDK' });
            });
            return files;
        } },
        util2: { cleanNodeModules: stream, setExecutableBit: stream },
    });
    const files = [];
    const done = new Promise((resolve, reject) => {
        output.on('data', file => files.push(file));
        output.on('end', resolve);
        output.on('error', reject);
    });
    assert.equal(scanned, false, 'never scan while postinstall is recreating the SDK');
    local.write({ path: 'extension.js' });
    sdkReady = true;
    local.end();
    await done;
    return files;
}
(async () => {
    assert.deepEqual((await fixture()).map(file => file.path), ['extension.js', 'sdk/index.js']);
    assert.deepEqual((await fixture({ empty: true })).map(file => file.path), ['extension.js']);
    console.log('Copilot packaging tests passed: scan after materialization, SDK delivery and no-dependency completion');
})().catch(error => { console.error(error); process.exitCode = 1; });
