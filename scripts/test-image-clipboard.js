#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/image-clipboard.js'), 'utf8');
function fixture({ image = null, text = '', nativeRead, refusal } = {}) {
    let listener;
    let requests = 0;
    const timers = new Map();
    let serial = 0;
    class Element {
        isConnected = true;
        events = [];
        closest() { return this; }
        dispatchEvent(event) { this.events.push(event); }
    }
    class ClipboardItem {
        constructor(items) { this.items = items; this.types = Object.keys(items); }
        async getType(type) { return this.items[type]; }
    }
    class DataTransfer {
        files = [];
        items = { add: file => this.files.push(file) };
    }
    const clipboard = { readText: async () => text };
    if (nativeRead) clipboard.read = nativeRead;
    const target = new Element();
    const document = { activeElement: target, addEventListener: (name, handler) => { listener = handler; } };
    const context = {
        window: {}, navigator: { clipboard }, document, Element, ClipboardItem, DataTransfer,
        ClipboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
        Blob, File, Uint8Array, Map, Promise, Error, atob, console,
        AndroidBridge: {}, crypto: { randomUUID: () => String(++serial) },
        setTimeout: callback => { const id = ++serial; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id),
        BroadcastChannel: class {
            postMessage(data) {
                requests++;
                queueMicrotask(() => this.onmessage({ data: refusal
                    ? { id: data.id, ok: false, error: refusal }
                    : { id: data.id, ok: true, data: JSON.stringify(image) } }));
            }
        }
    };
    vm.runInNewContext(source, context);
    return { clipboard, target, document, context, requests: () => requests, timers,
        paste: async (overrides = {}) => {
            const event = { isTrusted: true, target, clipboardData: { files: [], getData: () => '' },
                prevented: false, preventDefault() { this.prevented = true; }, ...overrides };
            await listener(event);
            return event;
        } };
}
(async () => {
    const image = { mime: 'image/png', base64: Buffer.from([137, 80, 78, 71]).toString('base64') };
    const denied = async () => { const error = new Error('denied'); error.name = 'NotAllowedError'; throw error; };
    const f = fixture({ image, nativeRead: denied });
    const items = await f.clipboard.read();
    assert.equal(items[0].types[0], 'image/png');
    assert.deepEqual(Buffer.from(await (await items[0].getType('image/png')).arrayBuffer()), Buffer.from([137, 80, 78, 71]));
    assert.equal(f.timers.size, 0, 'completed reads release their timeout');
    const native = [{ marker: 'native result' }];
    const n = fixture({ nativeRead: async () => native });
    assert.equal(await n.clipboard.read(), native);
    assert.equal(n.requests(), 0);
    const error = new Error('broken');
    const broken = fixture({ nativeRead: async () => { throw error; } });
    await assert.rejects(broken.clipboard.read(), /broken/);
    assert.equal(broken.requests(), 0);
    const t = fixture({ text: 'hello', nativeRead: denied });
    assert.equal(await (await (await t.clipboard.read())[0].getType('text/plain')).text(), 'hello');
    assert.equal((await fixture().clipboard.read()).length, 0);
    await assert.rejects(fixture({ refusal: 'too large' }).clipboard.read(), /too large/);
    const paste = await f.paste();
    assert.equal(paste.prevented, true);
    assert.equal(f.target.events[0].clipboardData.files[0].type, 'image/png');
    assert.equal(f.target.events[0].clipboardData.files[0].name, 'clipboard.png');
    const before = f.requests();
    await f.paste({ isTrusted: false });
    await f.paste({ clipboardData: { files: [], getData: () => 'existing text' } });
    await f.paste({ clipboardData: { files: [new File([], 'native.png')], getData: () => '' } });
    assert.equal(f.requests(), before, 'native payloads and synthetic paste events bypass fallback');
    vm.runInNewContext(source, f.context);
    assert.equal(f.requests(), before, 'reinjection is idempotent');
    console.log('PASS: image bytes, native reads, text reads, refusals, paste payloads and reinjection');
})().catch(error => { console.error(error); process.exitCode = 1; });
