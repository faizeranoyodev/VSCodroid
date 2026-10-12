# Android image attachment fix

Base: VSCodroid aa973c6, VS Code 1.139.1 at 04c0d99f4fb0d8afe6ce4f0c58e31e183ac3e4b1.
Branch: fix/android-image-attachments.

## Changes

- Built-in chat's attachment menu includes **Image from Gallery...**.
- Image-filtered VS Code open dialogs use an HTML file input, which Android's
  document picker handles. File and folder dialogs keep their existing behavior.
- HTML accept types reach Android's picker, including image extension-to-MIME
  conversion. Unfiltered Explorer uploads continue to show all files.
- Selected images are stored under the remote preferred home directory's
  `.vscodroid/attachments/<unique-id>/` directory. Extensions receive readable
  remote URIs. Successful imports remain there for chats to reference; they can
  be deleted after the chats no longer need them. Failed imports are removed.
- `navigator.clipboard.read()` falls back to an asynchronous Android image read
  when native clipboard permissions fail. An empty native paste event in a
  composer receives a synthetic File payload. Text and existing native image
  paste payloads are preserved.
- PNG, JPEG, GIF, BMP, TIFF and WebP clipboard signatures are recognised.
  Clipboard reads and individual gallery files have a 20 MiB limit.

This integrates the workbench and standard VS Code image dialogs. Extensions
with private attachment interfaces or isolated iframe clipboard handlers may
need extension-specific changes. Image-capable models are still required. A
clipboard must contain an image content URI; copying a file path is not image
copying. No device behavior or full Android compilation has been verified yet.

## Build an installable APK

This checkout is source, not an APK. Adding a VS Code patch requires rebuilding
the server; an existing upstream server tarball will not contain this fix and
the repository's patch-manifest check will reject it.

1. Apply the supplied patch to the base commit, or use the supplied source ZIP.
2. Push the changes to `main` in your own GitHub fork. Changes to the patches
   automatically start **Build Code - OSS server** on an ARM64 runner. Its
   successful publication automatically starts the **Build** workflow for the
   APK. A manually dispatched server run only builds an intermediate artifact;
   server publication is limited to pushes.
3. On a Linux or macOS build machine, install the prerequisites in
   `CONTRIBUTING.md`: Android SDK/NDK, JDK, CMake, Node and GnuPG. Configure
   `ANDROID_HOME` and `ANDROID_NDK_HOME`, and authenticate `gh` for downloads.
4. Build against your fork's server release, replacing `YOUR_ACCOUNT` below:

   ```bash
   REPO=YOUR_ACCOUNT/VSCodroid ./scripts/build-all.sh
   ```

   Follow `CONTRIBUTING.md` if additional setup is needed. Do not bypass the
   server-tree verification to use an old tarball.
5. The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`.
   The debug app uses `com.vscodroid.debug`, so it can be tested separately
   from the release app. Transfer the APK to your Android 13+ ARM64 phone
   and install it, or use `adb install -r` on the APK.

## Validation performed

- `node scripts/test-image-clipboard.js`: passed.
- `node scripts/test-android-image-picker.js` (Node 24): passed.
- `node scripts/test-bridge-relay.js`: passed.
- `python3 scripts/check-bridge-api-spec.py`: passed.
- Staged source whitespace check (excluding literal patch-file context): passed.
- Patch 0028 applies cleanly to the pinned upstream source files.
- Android unit tests/build: blocked before compilation because Gradle's download
  endpoint was unreachable. The environment also has no Android SDK or device.
  Kotlin unit tests were added but could not be run.

## Device test checklist

1. Built-in chat: +, Image from Gallery..., select PNG/JPEG; check attachment preview.
2. Select multiple images, including files with identical names.
3. Cancel the picker, then open it again; it must not remain stuck.
4. Copy an actual image from a gallery app supporting image copy and paste it
   into the composer; check the preview. Test the paste command as well.
5. Copy text and paste into chat, editor and terminal; check that text still works.
6. Test a WebP image, a file over 20 MiB, and a provider whose read fails.
7. Test the exact extensions you use and their + menus. Record extension names,
   versions and whether they use a native picker, VS Code dialog or private UI.
8. Explorer Upload..., Open Folder and folder selection should still work.
