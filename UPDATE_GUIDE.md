# Updating an unpacked DuoChat installation

DuoChat can check the public `dzvellox/DuoChat` GitHub releases and download the latest ZIP. Chrome does not let an unpacked extension silently replace its own installed files.

## Recommended update flow

1. In DuoChat, open **Settings → GitHub updates**.
2. Click **Check now**.
3. Click **Download update**.
4. Extract the downloaded ZIP over the **same DuoChat folder** you originally loaded in Chrome.
5. Open `chrome://extensions`.
6. Click **Reload** on DuoChat.

Your DuoChat data is stored in Chrome's local extension storage, not in the source files. Avoid loading a second copy from a different folder while updating.

## Optional hardened Windows helper

`Update-DuoChat.cmd` runs the bundled PowerShell helper. Before replacing any source file, it:

- queries the official GitHub API endpoint for `dzvellox/DuoChat`;
- requires the exact `DuoChat-<version>.zip` release asset;
- restricts the download source to the expected GitHub release path;
- verifies GitHub's SHA-256 digest for the release asset;
- rejects absolute paths and `..` path traversal in ZIP entries;
- requires `manifest.json` at the archive root;
- verifies Manifest V3, `short_name: DuoChat`, the release/manifest version match, and core required files;
- backs up the current source files before copying the update.

Chrome still requires you to click **Reload** afterward.

> This protects against corruption and several archive/update attacks. It cannot protect against compromise of the GitHub account/repository itself. Protect the GitHub account with strong 2FA/passkeys and review releases before publishing them.
