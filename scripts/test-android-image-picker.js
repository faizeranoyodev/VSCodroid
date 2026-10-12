#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const patch = fs.readFileSync(path.join(__dirname, '../patches/0028-android-image-attachment-picker.patch'), 'utf8');
const added = patch.split('\n').filter(line => (line.startsWith('+') && !line.startsWith('+++')) || line.startsWith(' ')).map(line => line.slice(1)).join('\n');
const start = added.indexOf('\tprivate async pickAndroidImages(');
assert.notEqual(start, -1);
const end = added.indexOf('\n\t}\n', start) + '\n\t}'.length;
const source = stripTypeScriptTypes(added.slice(start, end).replace('private async pickAndroidImages', 'async function pickAndroidImages'));
function fixture(files, { cancel = false, failWrite = false } = {}) {
    const writes = [];
    const folders = [];
    const deleted = [];
    const input = {
        files, handlers: {}, removed: false,
        addEventListener(event, handler) { this.handlers[event] = handler; },
        remove() { this.removed = true; },
        click() { if (cancel) this.files = []; queueMicrotask(() => this.handlers[cancel ? 'cancel' : 'change']()); }
    };
    const targetWindow = { document: { createElement: () => input, body: { appendChild() {} } }, crypto: { randomUUID: () => 'unique' } };
    const services = {
        preferredHome: async () => 'vscode-remote://device/home',
        fileService: {
            createFolder: async uri => folders.push(uri),
            writeFile: async (uri, buffer) => { if (failWrite) throw new Error('disk full'); writes.push([uri, buffer]); },
            del: async uri => deleted.push(uri)
        }
    };
    const context = { Array, Uint8Array, Promise, Error, Schemas: { vscodeRemote: 'vscode-remote' },
        joinPath: (...parts) => parts.join('/'), VSBuffer: { wrap: bytes => bytes } };
    const pick = vm.runInNewContext(source + '\npickAndroidImages', context);
    return { input, writes, folders, deleted, run: options => pick.call(services, options, targetWindow, ['png', 'jpg']) };
}
(async () => {
    const image = name => ({ name, size: 4, arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer });
    const f = fixture([image('../same.png'), image('../same.png')]);
    const result = await f.run({ canSelectMany: true });
    assert.equal(f.input.accept, '.png,.jpg');
    assert.equal(f.input.multiple, true);
    assert.equal(f.input.removed, true);
    assert.equal(result.length, 2);
    assert.notEqual(result[0], result[1], 'same names must not overwrite each other');
    assert.equal(result[0], 'vscode-remote://device/home/.vscodroid/attachments/unique/0-.._same.png');
    assert.deepEqual(Array.from(f.writes[0][1]), [1, 2, 3, 4]);
    const canceled = fixture([], { cancel: true });
    assert.equal(await canceled.run({}), undefined);
    assert.equal(canceled.folders.length, 0);
    assert.equal(canceled.input.removed, true);
    const oversized = fixture([{ name: 'huge.png', size: 20 * 1024 * 1024 + 1 }]);
    await assert.rejects(oversized.run({}), /20 MB/);
    assert.equal(oversized.folders.length, 0);
    const failed = fixture([image('image.png')], { failWrite: true });
    await assert.rejects(failed.run({}), /disk full/);
    assert.equal(failed.deleted.length, 1, 'partial imports must be removed');
    console.log('PASS: gallery MIME filter, multiple images, remote URIs, bytes, cancel, size limit and failed-write cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
