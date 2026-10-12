'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('android/app/src/main/assets/image-input.js', 'utf8');
function fixture(parent) {
    const listeners = {};
    const events = [];
    const target = { tagName: 'TEXTAREA', isConnected: true, dispatchEvent(event) { events.push(event); } };
    const document = { activeElement: target, addEventListener(name, fn) { listeners[name] = fn; } };
    const window = { addEventListener(name, fn) { listeners[name] = fn; } };
    window.top = parent ? parent.window : window;
    window.parent = parent ? { postMessage: data => parent.listeners.message({ data, source: window }) } : window;
    const timers = new Map(); let seq = 0;
    const context = { window, document, console, Uint8Array, atob, crypto,
        setTimeout(fn) { timers.set(++seq, fn); return seq; }, clearTimeout(id) { timers.delete(id); },
        DataTransfer: class { constructor() { this.files = []; this.items = { add: f => this.files.push(f) }; } },
        File: class { constructor(parts, name, opts) { Object.assign(this, { parts, name, type: opts.type }); } },
        ClipboardEvent: class { constructor(type, opts) { Object.assign(this, { type }, opts); } },
        navigator: { clipboard: { read: async () => [] } },
    };
    vm.runInNewContext(source, context);
    const f = { window, document, target, events, listeners, timers, context, api: window.__vscodroidImageInput };
    if (parent) {
        // Model each receiving window's view of postMessage's sender.
        window.postMessage = data => listeners.message({ data, source: window.parent });
        parent.document.activeElement = { tagName: 'IFRAME', isConnected: true, contentWindow: window };
    }
    return f;
}
const image = { mime: 'image/png', base64: btoa('image bytes') };
const root = fixture();
assert.equal(root.api.begin('direct'), true);
assert.equal(root.api.deliver('direct', image), true);
assert.equal(root.events[0].clipboardData.files[0].name, 'clipboard.png');
assert.equal(root.api.deliver('direct', image), false, 'deliver only once');
root.api.begin('changed'); root.document.activeElement = {};
assert.equal(root.api.deliver('changed', image), false, 'never insert after focus changes');
root.document.activeElement = root.target; root.api.begin('expired');
for (const timer of root.timers.values()) timer();
assert.equal(root.api.deliver('expired', image), false);
root.document.activeElement = { tagName: 'INPUT' };
assert.equal(root.api.begin('filename'), false);
const main = fixture(); const child = fixture(main); const nested = fixture(child);
assert.equal(main.api.begin('nested'), true);
assert.equal(main.api.deliver('nested', image), true);
assert.equal(nested.events.length, 1, 'image must reach nested extension composer');
main.api.begin('focus-away'); nested.document.activeElement = {};
main.api.deliver('focus-away', image);
assert.equal(nested.events.length, 1);
nested.document.activeElement = nested.target;
nested.listeners.message({ source: {}, data: { type: 'vscodroid-image-input', action: 'begin', id: 'spoof' } });
assert.equal(nested.api.deliver('spoof', image), false, 'unrelated frames cannot prepare insertion');
main.api.begin('bad-mime'); main.api.deliver('bad-mime', { mime: 'text/plain', base64: image.base64 });
assert.equal(nested.events.length, 1);
console.log('Image input tests passed: nested frames, file payload, focused target, replay, expiry, MIME and sender guards');
