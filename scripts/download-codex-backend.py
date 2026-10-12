#!/usr/bin/env python3
"""Install the stable open-source backend tested with Codex IDE 26.908.40401.

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
TAG = 'rust-v0.162.1'
COMMIT = '092d3acd6bec3e3a14bdc7e7a2810ab628ab759d'
PAYLOADS = [
    ('codex', 'libcodex.so', 'bf3ca2719f1143b1440fbd85c149379e696c782c50ad7991f8bfcec60b2600c1',
     '071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5'),
    ('codex-code-mode-host', 'libcodex-modehost.so', '1395ce9367f8acd280674dff083edf25bf221d908b8351d5bd4f3fdde9181e9a',
     'f6477b0357a8cc2291d628962876ecb1a2beb872f71a1e2734363c81ff21700d'),
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
    if len(old) != len(new) or data.count(old) != 3:
        raise RuntimeError('Unexpected Codex helper basename layout')
    return data.replace(old, new)

def main():
    cache = ROOT / 'downloads' / 'codex' / TAG
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
        'Codex 0.162.1: helper filename changed from codex-code-mode-host '
        'to libcodex-modehost.so for Android packaging. No API, authentication, '
        'approval policy or sandbox configuration is modified.\n')

if __name__ == '__main__':
    main()
