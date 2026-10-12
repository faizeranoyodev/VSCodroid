#!/usr/bin/env python3
"""Install the exact open-source backend matching Codex IDE 26.908.40401.

Only official release payloads, pinned by archive AND extracted binary digest.
No IDE extension is redistributed. The helper basename patch is equal-length,
so ELF layout, addresses and Rust string lengths are unchanged.
"""
import hashlib
import io
import pathlib
import subprocess
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
TAG = 'rust-v0.154.0-alpha.6.2'
COMMIT = 'b5bffd3ec4db487e7e3dec59663875b0ef7b72ca'
PAYLOADS = [
    ('codex', 'libcodex.so', '65cc130ab7bc42533c315981496342f455f9fc04e73f8537be8ed06b5a198761',
     '249471afa90ed13ee387038bf5daad182a22178bdc1b7f6dbee25812774ff7dc'),
    ('codex-code-mode-host', 'libcodex-modehost.so', 'f5ee23396172294124e15984c68a9e04c1d722c7027a2b2a4866ef4e6c31a817',
     'dfd7ef128561b7dcc3f12462f1acdf811ba2c2bf5d95fa78c6306fd4cf93db68'),
]

def download(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()

def checked(data, digest):
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError('Codex payload SHA256 mismatch')
    return data

def patch_backend(data):
    old, new = b'codex-code-mode-host', b'libcodex-modehost.so'
    if len(old) != len(new) or data.count(old) != 2:
        raise RuntimeError('Unexpected Codex helper basename layout')
    return data.replace(old, new)

def main():
    cache = ROOT / 'downloads' / 'codex'
    target = ROOT / 'android/app/src/main/jniLibs/arm64-v8a'
    cache.mkdir(parents=True, exist_ok=True)
    target.mkdir(parents=True, exist_ok=True)
    for name, filename, archive_digest, binary_digest in PAYLOADS:
        archive_name = f'{name}-aarch64-unknown-linux-musl.tar.gz'
        archive = cache / archive_name
        if not archive.exists():
            archive.write_bytes(checked(download(f'https://github.com/openai/codex/releases/download/{TAG}/{archive_name}'), archive_digest))
        raw = checked(archive.read_bytes(), archive_digest)
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
            members = [m for m in tar.getmembers() if m.isfile() and pathlib.PurePosixPath(m.name).name == f'{name}-aarch64-unknown-linux-musl']
            if len(members) != 1:
                raise RuntimeError(f'Unexpected archive layout: {archive_name}')
            binary = checked(tar.extractfile(members[0]).read(), binary_digest)
        if name == 'codex':
            binary = patch_backend(binary)
        dest = target / filename
        dest.write_bytes(binary)
        dest.chmod(0o755)
        subprocess.run(['python3', str(ROOT / 'scripts/verify-android-elf.py'), str(dest)], check=True)
        print(f'{filename}: {hashlib.sha256(binary).hexdigest()}')
    docs = ROOT / 'android/app/src/main/assets/usr/share/doc/codex'
    docs.mkdir(parents=True, exist_ok=True)
    for name in ['LICENSE', 'NOTICE']:
        (docs / name).write_bytes(download(f'https://raw.githubusercontent.com/openai/codex/{COMMIT}/{name}'))
    (docs / 'VSCODROID_MODIFICATIONS.txt').write_text(
        'Codex 0.154.0-alpha.6.2: helper filename changed from codex-code-mode-host '
        'to libcodex-modehost.so for Android packaging. No API, authentication, '
        'approval policy or sandbox configuration is modified.\n')

if __name__ == '__main__':
    main()
