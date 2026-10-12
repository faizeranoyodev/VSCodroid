'use strict';

// Android refuses execve of the extension's app-data ELF. The APK packages the
// matching open-source backend in nativeLibraryDir, which Android can execute.
// Pin the redirect to one extension version: never mix protocols silently after
// an extension update, and never rewrite unrelated programs or custom CLI paths.
const cp = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const version = '26.908.40401';
const home = process.env.HOME;
const nativeDir = process.env.VSCODROID_NATIVE_LIB_DIR;

if (home && nativeDir && path.isAbsolute(nativeDir)) {
    const extensionRoot = path.join(home, '.vscodroid', 'extensions');
    const sources = new Set(['', '-alpine-arm64', '-linux-arm64'].map(suffix =>
        path.join(extensionRoot, `openai.chatgpt-${version}${suffix}`, 'bin', 'linux-aarch64', 'codex')));
    const target = path.join(nativeDir, 'libcodex.so');
    const host = path.join(nativeDir, 'libcodex-modehost.so');
    function redirect(file) {
        if (typeof file !== 'string' || !sources.has(file)) return file;
        fs.accessSync(target, fs.constants.X_OK);
        fs.accessSync(host, fs.constants.X_OK);
        console.info('[VSCodroid Codex] Launching packaged backend 0.154.0-alpha.6.2');
        return target;
    }
    for (const name of ['spawn', 'spawnSync']) {
        const original = cp[name];
        cp[name] = function(file, ...rest) {
            return Reflect.apply(original, this, [redirect(file), ...rest]);
        };
    }
}
