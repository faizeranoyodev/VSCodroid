'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync('android/app/src/main/assets/codex-launch.js', 'utf8');
function fixture(env, denied = false) {
    const calls = [];
    const access = [];
    const cp = {};
    for (const name of ['spawn', 'spawnSync']) cp[name] = (...args) => { calls.push([name, ...args]); return 'process'; };
    const sandbox = {
        process: { env }, console: { info() {} },
        require(name) {
            if (name === 'node:child_process') return cp;
            if (name === 'node:path') return path;
            if (name === 'node:fs') return { constants: fs.constants, accessSync(p, mode) {
                access.push([p, mode]);
                if (denied) throw Object.assign(new Error('missing backend'), { code: 'ENOENT' });
            } };
            throw new Error(name);
        }
    };
    vm.runInNewContext(source, sandbox);
    return { cp, calls, access };
}
const env = { HOME: '/data/user/0/app/files/home', VSCODROID_NATIVE_LIB_DIR: '/data/app/app/lib/arm64' };
const prefix = `${env.HOME}/.vscodroid/extensions/`;
const suffix = '/bin/linux-aarch64/codex';
const args = ['-c', 'features.code_mode_host=true', 'app-server'];
const opts = { stdio: ['pipe', 'pipe', 'pipe'], env: { SECRET: 'unchanged' } };
for (const platform of ['', '-alpine-arm64', '-linux-arm64']) {
    const f = fixture(env);
    for (const method of ['spawn', 'spawnSync']) {
        assert.equal(f.cp[method](`${prefix}openai.chatgpt-26.908.40401${platform}${suffix}`, args, opts), 'process');
        const call = f.calls.at(-1);
        assert.equal(call[1], `${env.VSCODROID_NATIVE_LIB_DIR}/libcodex.so`);
        assert.equal(call[2], args);
        assert.equal(call[3], opts);
    }
    assert.equal(f.access.length, 4);
}
for (const file of [
    `${prefix}openai.chatgpt-26.908.40402-alpine-arm64${suffix}`,
    `${prefix}another.extension-26.908.40401-alpine-arm64${suffix}`,
    `${prefix}../extensions/openai.chatgpt-26.908.40401-alpine-arm64${suffix}`,
    '/custom/codex', 'codex', '/system/bin/sh'
]) {
    const f = fixture(env); f.cp.spawn(file, args, opts);
    assert.equal(f.calls[0][1], file); assert.equal(f.access.length, 0);
}
for (const disabled of [{}, { HOME: env.HOME }, { ...env, VSCODROID_NATIVE_LIB_DIR: 'relative' }]) {
    const f = fixture(disabled); const file = `${prefix}openai.chatgpt-26.908.40401-alpine-arm64${suffix}`;
    f.cp.spawn(file, args, opts); assert.equal(f.calls[0][1], file);
}
const denied = fixture(env, true);
assert.throws(() => denied.cp.spawn(`${prefix}openai.chatgpt-26.908.40401-alpine-arm64${suffix}`, args, opts), { code: 'ENOENT' });
assert.equal(denied.calls.length, 0);
console.log('Codex launcher tests passed: pinning, unrelated paths, arguments, environment and missing payloads');
