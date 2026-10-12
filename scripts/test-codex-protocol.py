#!/usr/bin/env python3
"""Read-only protocol smoke test using the installed IDE's startup requests.

Run on Linux ARM64 in CI against the exact APK payload. No account credentials
or inference calls are used; the model assertion checks bundled client support.
"""
import json
import os
import pathlib
import selectors
import subprocess
import sys
import tempfile
import time


def main(binary):
    version = subprocess.check_output([binary, '--version'], text=True, timeout=20)
    assert '0.162.1' in version, version
    print('Backend version:', version.strip())
    with tempfile.TemporaryDirectory() as home:
        codex_home = pathlib.Path(home, '.codex')
        codex_home.mkdir()
        image = codex_home / 'protocol-fixture.txt'
        image.write_text('attachment bytes')
        env = {key: value for key, value in os.environ.items()
               if key not in {'OPENAI_API_KEY', 'CODEX_API_KEY'}}
        env.update(HOME=home, CODEX_HOME=str(codex_home))
        requests = [
            ('initialize', {'clientInfo': {'name': 'codex_vscode', 'version': '26.908.40401'},
                            'capabilities': {'experimentalApi': True}}),
            ('config/read', {'includeLayers': False, 'cwd': None}),
            ('model/list', {'includeHidden': True, 'cursor': None, 'limit': 100}),
            ('account/read', {'refreshToken': False}),
            ('getAuthStatus', {'includeToken': False, 'refreshToken': False}),
            ('remoteControl/status/read', None),
            ('fs/readFile', {'path': str(image)}),
        ]
        # Keep stderr in a file so warnings cannot block the protocol pipe.
        with tempfile.TemporaryFile() as errors:
            proc = subprocess.Popen(
                [binary, '-c', 'features.code_mode_host=true', 'app-server'],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors,
                env=env, bufsize=0,
            )
            selector = selectors.DefaultSelector()
            selector.register(proc.stdout, selectors.EVENT_READ)
            try:
                for index, (method, params) in enumerate(requests, 1):
                    message = {'id': index, 'method': method, 'params': params}
                    proc.stdin.write((json.dumps(message) + '\n').encode())
                    proc.stdin.flush()
                    deadline = time.monotonic() + 30
                    while True:
                        assert selector.select(max(0, deadline - time.monotonic())), method + ' timed out'
                        line = proc.stdout.readline()
                        assert line, 'Backend exited while handling ' + method
                        reply = json.loads(line)
                        if reply.get('id') == index:
                            assert 'result' in reply and 'error' not in reply, reply
                            if method == 'model/list':
                                models = reply['result']['data']
                                assert any(m['model'] == 'gpt-6.1-sol' for m in models), models
                                print('PASS: bundled catalog contains gpt-6.1-sol')
                            if method == 'fs/readFile':
                                assert reply['result']['dataBase64'] == 'YXR0YWNobWVudCBieXRlcw==', reply
                            print('PASS:', method)
                            break
                        assert time.monotonic() < deadline, method + ' timed out'
                    if index == 1:
                        proc.stdin.write(b'{"method":"initialized"}\n')
                        proc.stdin.flush()
            finally:
                proc.kill()
                proc.wait(timeout=10)
                selector.close()
                errors.seek(0)
                stderr = errors.read().decode(errors='replace')
                if 'unknown feature' in stderr.lower():
                    raise AssertionError(stderr)


if __name__ == '__main__':
    main(str(pathlib.Path(sys.argv[1]).resolve()))
