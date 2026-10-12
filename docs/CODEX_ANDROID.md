# Codex stable backend and model catalog test build

This build supports the user-installed `openai.chatgpt` IDE extension version
**26.908.40401** on ARM64. Keep that version installed while testing; turn off
its automatic updates in the extension's gear menu.

The extension directly spawns its backend from its extension directory. Android
refuses that app-data executable with EACCES. This APK bundles the protocol-tested
open-source Codex backend **0.162.1** and its code-mode helper as native
libraries, which Android installs in its executable nativeLibraryDir.
`platform-fix.js` loads a narrow subprocess redirect for this extension version.
It preserves all arguments, environment, input/output and approval configuration.

Codex looks up its code-mode helper beside its executable. Android extracts only
lib*.so names, so the download script replaces the backend's three equal-length
`codex-code-mode-host` strings with `libcodex-modehost.so`. It checks both the
archive digest and original binary digest before patching, as well as the ELF
architecture and segment alignment. The helper binary is unchanged.

The server grants `chatSessionsProvider` and `languageModelProxy` to
`openai.chatgpt` through its product configuration, matching this version's
manifest. It also passes `--enable-proposed-api openai.chatgpt` to the server,
which forwards the permission to the browser workbench. No global proposed-API
permission is granted.

The downloadable APK uses a separate package, `com.vscodroid.codexmodels`,
because hosted CI debug signing keys can differ between runs. It preserves your
previous app and its data. Force-stop the previous VSCodroid app, install and
open this test app, then install Codex 26.908.40401 and sign in. The terminal command from the earlier diagnostic now redirects to the
packaged backend; its `--version` should print `0.162.1`.

This is a startup compatibility change, not proof that every Linux tool works on
Android. Actual device testing must cover backend startup, sign-in, one chat,
file edits, code-mode and terminal tools. Linux namespaces and sandbox helpers
can still be restricted by Android. The build does not disable Codex approvals
or change its sandbox configuration. If a runtime failure remains, the Codex
Output channel and the `[VSCodroid Codex]` extension host message identify it.

Original source: https://github.com/openai/codex/tree/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d

## Image attachments

Codex file-only dialogs use Android's document picker, preserving filters and
multiple selection. Selected files are copied into remote-accessible attachment
paths; each file is limited to 20 MB. Folder selection remains in the workspace.

The WebView advertises PNG, JPEG, GIF and WebP to Android image keyboards.
It accepts explicitly committed content URIs, reads them on a bounded worker,
and releases temporary permissions after reading. Document-start code routes
the resulting paste event through the focused frame chain to the composer.
Focus changes, expired requests and unrelated message senders are rejected.
Only native keyboard commits initiate this delivery; extension frames cannot
request native clipboard reads through the message channel.

Device testing must cover Codex + selection, Gboard image insertion, clipboard
paste, cancellation and navigating away while an image is loading.

## Model catalog upgrade

The stable backend's bundled model catalog includes `gpt-6.1-sol`. Its model
manager validates cached catalogs against client version and authentication
identity, so the previous backend's cache is not reused. No model is invented
or inserted into server-returned account catalogs.

`scripts/test-codex-protocol.py` checks the pinned extension's startup requests,
config/model listing, account/auth status, remote-control status and filesystem
read response. It verifies the exact backend version and `gpt-6.1-sol` in the
unauthenticated bundled catalog. It performs no inference and uses no account
credentials. CI repeats this on ARM64 against the exact APK payload before
publishing. This establishes protocol compatibility for those requests, not
Android device sign-in, authenticated model availability or every extension
feature.

After installing, sign in and reload the window, then open a new Codex chat.
Check the model picker. If the model remains missing, inspect the authenticated
catalog from the terminal:

```sh
"$VSCODROID_NATIVE_LIB_DIR/libcodex.so" debug models | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\n".join(m["slug"] for m in d.get("models",[])))'
```

Account/workspace availability can still filter models. Selecting a model in
configuration does not grant access to it.
