# Codex startup test build

This build supports the user-installed `openai.chatgpt` IDE extension version
**26.908.40401** on ARM64. Keep that version installed while testing; turn off
its automatic updates in the extension's gear menu.

The extension directly spawns its backend from its extension directory. Android
refuses that app-data executable with EACCES. This APK bundles the matching
open-source Codex backend **0.154.0-alpha.6.2** and its code-mode helper as native
libraries, which Android installs in its executable nativeLibraryDir.
`platform-fix.js` loads a narrow subprocess redirect for this extension version.
It preserves all arguments, environment, input/output and approval configuration.

Codex looks up its code-mode helper beside its executable. Android extracts only
lib*.so names, so the download script replaces the backend's two equal-length
`codex-code-mode-host` strings with `libcodex-modehost.so`. It checks both the
archive digest and original binary digest before patching, as well as the ELF
architecture and segment alignment. The helper binary is unchanged.

The server grants `chatSessionsProvider` and `languageModelProxy` to
`openai.chatgpt` through its product configuration, matching this version's
manifest. It also passes `--enable-proposed-api openai.chatgpt` to the server,
which forwards the permission to the browser workbench. No global proposed-API
permission is granted.

The downloadable APK uses a separate package, `com.vscodroid.codextest`,
because hosted CI debug signing keys can differ between runs. It preserves your
previous app and its data. Force-stop the previous VSCodroid app, install and
open this test app, then install Codex 26.908.40401 and sign in. The terminal command from the earlier diagnostic now redirects to the
packaged backend; its `--version` should print `0.154.0-alpha.6.2`.

This is a startup compatibility change, not proof that every Linux tool works on
Android. Actual device testing must cover backend startup, sign-in, one chat,
file edits, code-mode and terminal tools. Linux namespaces and sandbox helpers
can still be restricted by Android. The build does not disable Codex approvals
or change its sandbox configuration. If a runtime failure remains, the Codex
Output channel and the `[VSCodroid Codex]` extension host message identify it.

Original source: https://github.com/openai/codex/tree/b5bffd3ec4db487e7e3dec59663875b0ef7b72ca
