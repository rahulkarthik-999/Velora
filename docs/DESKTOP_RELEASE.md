# Velora desktop: Windows installer and releases

Velora's desktop app is a Tauri 2 app packaged as an NSIS installer, published as
**`Velora-Setup.exe`** on GitHub Releases. The website's download page
(`/download`, `/api/desktop/download`) always serves the newest release.

## Build locally

Prerequisites (once per machine): Rust (stable, MSVC), Visual Studio Build Tools with
the C++ workload, Node 20, pnpm.

```powershell
pnpm install

# from apps/desktop
pnpm type-check
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm release:windows
```

`pnpm release:windows` runs `tauri build` and then `scripts/finalize-installer.mjs`, which
copies the installer to its public name and writes its SHA-256:

```
apps/desktop/src-tauri/target/release/bundle/nsis/Velora-Setup.exe
apps/desktop/src-tauri/target/release/bundle/nsis/Velora-Setup.exe.sha256
apps/desktop/src-tauri/target/release/bundle/nsis/Velora_<version>_x64-setup.exe
```

The finalize step fails if the versions in `package.json` and `tauri.conf.json` differ
or the installer is missing, so a stale file is never published.

## Release (GitHub Actions)

`.github/workflows/desktop-release.yml` runs on a `desktop-v*` tag (or manually):

1. Installs dependencies and checks the tag equals the app version.
2. Runs the type-check, frontend tests and Rust tests.
3. Builds the installer and uploads it as a workflow artifact.
4. For a tag: creates a **draft** release with all files, then publishes it. A failure at
   any step leaves no public release.

To release:

```bash
# bump the same version in apps/desktop/package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml
git tag desktop-v0.3.0
git push origin desktop-v0.3.0
```

## Versioning

Semantic versioning, `MAJOR.MINOR.PATCH`, kept identical in the three files above. The
installer refuses to install an older version over a newer one (`allowDowngrades: false`),
because an older app can't open a database upgraded by a newer one.

## What the installer does

- **Install mode `currentUser`:** installs to `%LOCALAPPDATA%\Velora` with no admin prompt;
  the wizard lets the user change the folder. Every earlier release installed this way, so
  upgrades replace the existing copy in place. (`both`, which also offers Program Files,
  was tested and rejected: an elevated upgrade installed a second copy under Program Files
  next to the existing per-user one.)
- **Shortcuts:** Start Menu (`Velora\Velora.lnk`); the finish page offers a Desktop shortcut.
- **Executable:** `Velora.exe` (0.2.x used `velora-desktop.exe`; the installer replaces it and
  updates shortcuts).
- **User data is never in the install folder:**
  - settings and database: `%APPDATA%\online.veloraweb.desktop`
  - logs: `%LOCALAPPDATA%\online.veloraweb.desktop`
  - sign-in token: Windows Credential Manager (`Velora`)
- **Uninstall** removes the app, shortcuts and registry entries only. App data is deleted
  only if the user ticks "Delete the application data" in the uninstaller.
- **Graphics:** `src-tauri/installer/header.bmp` and `sidebar.bmp`, generated from the app
  icon by `python scripts/make-installer-images.py`.

## Code signing (not yet set up)

The installer is unsigned, so SmartScreen shows "Windows protected your PC" until the file
builds reputation. When a code-signing certificate is available (an EV certificate gets
SmartScreen reputation immediately), set `bundle.windows.certificateThumbprint` (or a
`signCommand` for a cloud HSM such as Azure Trusted Signing) in `tauri.conf.json`, and add
the certificate to the workflow as a secret. Never commit the certificate or its password.

## Automatic updates (prepared, not enabled)

Not enabled on purpose: Tauri's updater must verify signed update bundles. To turn it on:

1. `pnpm tauri signer generate -w ~/.tauri/velora.key` and store the private key and its
   password as GitHub secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
2. Add `tauri-plugin-updater`, set `bundle.createUpdaterArtifacts: true`, and put the
   **public** key and the endpoint (`https://github.com/rahulkarthik-999/Velora/releases/latest/download/latest.json`)
   in `plugins.updater`.
3. Have the workflow upload `latest.json` and the `.sig` files with each release.
4. Test an update from the previous release before shipping.

## Security notes

- The desktop binary contains no provider API keys. AI and transcription go through the
  Velora API with the user's revocable device token.
- No obfuscation or disguised file names; the installer and exe carry Velora's real name,
  publisher and version.
