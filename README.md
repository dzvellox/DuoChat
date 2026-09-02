<div align="center">
  <img src="./icons/icon-128.png" width="104" height="104" alt="DuoChat Logo">

  <h1>DuoChat</h1>

  <p><strong>Two local, password-protected spaces inside a single ChatGPT session.</strong></p>

  <p>
    DuoChat separates the conversations and projects of two users sharing the same ChatGPT account in Chrome.
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-1.1.1-6558E8" alt="Version 1.1.1">
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/tests-9%20passed-13866F" alt="9 tests passed">
    <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial-5C5C68" alt="AGPL-3.0 and commercial license">
  </p>
</div>

> [!IMPORTANT]
> DuoChat provides a **local user-interface separation layer**. It does not turn one ChatGPT account into two real OpenAI accounts and it is not an unbreakable parental-control or security boundary.

## Table of contents

- [Why DuoChat?](#why-duochat)
- [Features](#features)
- [Installation](#installation)
- [First-time setup](#first-time-setup)
- [Usage](#usage)
- [Existing conversations and projects](#existing-conversations-and-projects)
- [How it works](#how-it-works)
- [Security and privacy](#security-and-privacy)
- [Chrome permissions](#chrome-permissions)
- [Important limitations](#important-limitations)
- [Development](#development)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Licensing](#licensing)
- [Disclaimer](#disclaimer)

## Why DuoChat?

ChatGPT does not currently provide personal sub-profiles that allow two people to share the same account while keeping two visually separated conversation histories.

DuoChat adds that organization directly in the browser:

- **User A** only sees their own conversations and projects;
- **User B** only sees theirs;
- each space has its own password;
- switching profiles requires the target profile's password;
- no external DuoChat infrastructure is required.

## Features

### Two local profiles

- Two independent spaces: User A and User B.
- Custom profile names during first-time setup.
- A separate password for each profile.
- Remembers the last selected profile.
- Automatically locks after the browser session ends.

### Conversation separation

- Automatically assigns new conversations to the active profile.
- Hides conversations belonging to the other profile.
- Blocks direct access to a protected conversation.
- Protects the browser tab title when locked content is opened.

### Project separation

- Automatically assigns new projects to the active profile.
- Hides projects belonging to the other profile.
- Blocks direct access to a protected project.
- Silently assigns new conversations created inside an authorized project to the correct profile.
- Recognizes the different project identifier formats used by ChatGPT.

### Locking and recovery

- Immediate locking from the extension menu.
- Keyboard shortcut: `Alt` + `Shift` + `L`.
- Recovery mode for assigning items that existed before DuoChat was installed.
- 30-second cooldown after five incorrect password attempts.

### Privacy

- No DuoChat server.
- No DuoChat account.
- No analytics or tracking.
- No message content stored or transmitted by the extension.
- No remotely loaded scripts.

## Installation

DuoChat is not yet distributed through the Chrome Web Store, so it must currently be installed in developer mode.

1. Download the repository using **Code → Download ZIP**, or clone it with Git.
2. Extract the archive if necessary.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the folder containing `manifest.json`.
7. Pin DuoChat from the Chrome extensions menu.
8. Open [chatgpt.com](https://chatgpt.com/).

> [!TIP]
> Keep the extension folder after installation. Chrome needs it to reload the extension and apply future updates.

## First-time setup

When DuoChat first runs on ChatGPT:

1. Choose a name for Profile A.
2. Create its password.
3. Choose a name for Profile B.
4. Create its password.
5. Select the first profile to open.
6. Choose whether the items currently visible should be assigned to that first profile.

Each password must contain at least six characters. For stronger protection, use a long and unique passphrase for each user.

> [!WARNING]
> There is no password recovery mechanism. Deleting the extension's data also resets the profiles and all local ownership assignments.

## Usage

### Create a conversation

Open the correct profile, then create a conversation normally in ChatGPT. DuoChat automatically assigns it to the active profile.

### Use a project

Open or create the project from the correct profile. The project and any new conversations started inside it are associated with the same user automatically.

### Switch users

1. Click the DuoChat icon in the Chrome toolbar.
2. Select the other profile.
3. Enter that profile's password.

The ChatGPT page is immediately filtered to show the conversations and projects belonging to the selected user.

### Lock the space

Use the **Lock now** button in the DuoChat menu or press `Alt` + `Shift` + `L`.

Extension shortcuts can be changed from `chrome://extensions/shortcuts`.

## Existing conversations and projects

DuoChat cannot automatically determine who owns items created before the extension was installed.

To classify them:

1. Open the profile that should own the items.
2. Click the DuoChat icon.
3. Enable **Recover existing items**.
4. Unassigned items appear with an orange outline.
5. Click a project or conversation to assign it to the active profile.
6. Disable recovery mode when finished.

An item already assigned to the other profile cannot be recovered from the wrong space.

## How it works

DuoChat is a Chrome **Manifest V3** extension with no runtime dependency and no remote DuoChat service.

| File | Responsibility |
| --- | --- |
| `manifest.json` | Permissions, scripts, popup, icons and keyboard shortcut |
| `background.js` | Authentication, item ownership, storage and synchronization between tabs |
| `content.js` | Page protection, ChatGPT route detection and interface filtering |
| `content.css` | Setup, lock screen and protection styles |
| `popup.html` / `popup.css` / `popup.js` | DuoChat menu and profile switching |
| `core.js` | Shared validation, identifier normalization and cryptography |
| `tests/` | Core, manifest and static security tests |

### Conversation lifecycle

1. The user unlocks a profile with its password.
2. A new conversation receives the active profile identifier.
3. The association is stored locally.
4. Links belonging to the other profile are hidden.
5. A direct-access attempt displays the protection screen.

### Local storage

| Data | Location | Retention |
| --- | --- | --- |
| Profile names | `chrome.storage.local` | Until extension data is deleted |
| Password hashes | `chrome.storage.local` | Until extension data is deleted |
| Conversation and project ownership | `chrome.storage.local` | Until extension data is deleted |
| Temporarily unlocked profile | `chrome.storage.session` | Browser session |
| Recovery mode | `chrome.storage.session` | Browser session |

## Security and privacy

### Password protection

Passwords are never stored in plaintext. DuoChat uses:

- PBKDF2 with SHA-256;
- 310,000 iterations;
- a random 16-byte salt unique to each profile;
- constant-time hash comparison;
- temporary rate limiting after repeated failures.

### Data handled by DuoChat

The extension only stores the information required for local separation:

- profile names;
- cryptographic password hashes;
- technical identifiers for conversations and projects;
- active profile and session state.

DuoChat does not store the text of messages, files uploaded to ChatGPT, or generated responses.

## Chrome permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Store profiles, password hashes and ownership assignments locally |
| `tabs` | Refresh protection in open ChatGPT tabs after a profile switch |
| `https://chatgpt.com/*` | Run the filtering logic only on ChatGPT |

DuoChat does not request access to global Chrome browsing history, downloads, the clipboard, camera or microphone.

## Important limitations

DuoChat provides a convenient separation layer for trusted people sharing a browser. It is not a strong security boundary.

- Both profiles still use the same OpenAI account and subscription.
- Usage limits, account settings, billing and product features remain shared.
- ChatGPT-managed memory and personalization are not separated by DuoChat.
- Someone with access to Chrome can disable the extension, clear its storage, or open the account in another browser or device.
- Browser developer tools may allow an advanced user to bypass a local-only protection layer.
- Changes to ChatGPT's interface or routes may require DuoChat updates.

For true isolation, use two separate OpenAI accounts or two separate Chrome profiles with independent ChatGPT sessions.

## Development

### Requirements

- Chrome or another Chromium browser compatible with Manifest V3;
- Node.js 20 or newer to run the tests;
- no dependency installation required.

### Run checks

```bash
npm test
npm run check
```

The current test suite checks, among other things:

- conversation identifier extraction;
- normalization of different project identifier formats;
- project recognition when opening a chat;
- password hashing and verification;
- ownership migration and validation;
- manifest validity;
- presence of declared files;
- absence of `eval` and remotely loaded scripts.

### Reload the extension during development

1. Modify the files.
2. Open `chrome://extensions`.
3. Click **Reload** on the DuoChat card.
4. Refresh any open ChatGPT tabs.

## Contributing

Bug fixes, improvements and compatibility reports are welcome.

1. Fork the repository.
2. Create a dedicated branch:

   ```bash
   git checkout -b fix/short-description
   ```

3. Make a focused change.
4. Run `npm run check`.
5. Clearly describe the problem being solved and the expected behavior.
6. Open a pull request.

When reporting a bug, include when possible:

- DuoChat version;
- Chrome version;
- exact reproduction steps;
- actual and expected behavior;
- a screenshot without personal data;
- errors shown in the extension console.

Never publish passwords, private conversation content, session cookies or authentication identifiers in an issue.

> [!NOTE]
> To preserve the project's ability to use dual licensing, significant contributions may require a separate Contributor License Agreement (CLA) before they are merged.

## Troubleshooting

### "Unassigned project" appears whenever a new chat is created

Install DuoChat `1.1.1` or later. This version normalizes the two project identifier formats ChatGPT may use for the same project.

### An existing conversation or project disappeared

The item is probably still unassigned. Enable **Recover existing items** from the correct profile, then select the item.

### The other profile cannot see any conversations

Existing items may have been assigned to the first profile during setup. Use recovery mode only for items that are still unassigned. A future management tool is planned to explicitly transfer an already assigned item.

### ChatGPT stays locked after switching profiles

Refresh the tab with `Ctrl` + `R`. Then check `chrome://extensions` to make sure DuoChat is enabled and up to date.

### The keyboard shortcut does not work

Open `chrome://extensions/shortcuts` and verify that the DuoChat shortcut does not conflict with another extension.

### Filtering stopped working after a ChatGPT update

Selectors and routes in a web application may change. Open an issue with reproduction steps, your Chrome version and an anonymized screenshot.

## Roadmap

- Transfer conversations or projects between profiles.
- Change profile names and passwords after setup.
- Configurable automatic lock delay.
- Encrypted export and import of local ownership assignments.
- Automated end-to-end tests against the ChatGPT interface.
- Verified compatibility with additional Chromium browsers.
- Preparation for a Chrome Web Store release.

Suggestions are welcome in the repository issues.

## Licensing

DuoChat uses a **dual-license model**:

1. **GNU Affero General Public License v3.0 (AGPL-3.0)** for anyone who wants to use, study, modify, distribute or commercially use the project while complying with the AGPL-3.0 requirements.
2. A **separate commercial license** for individuals or organizations that want to distribute, integrate or modify DuoChat under proprietary terms without being bound by the AGPL-3.0 copyleft requirements.

The commercial license currently uses a **15% royalty on Net Commercial Revenue** attributable to a proprietary commercial product that includes or is derived from DuoChat, unless a separate written agreement states otherwise.

See [`COMMERCIAL_LICENSE.md`](./COMMERCIAL_LICENSE.md) for the commercial terms.

> [!IMPORTANT]
> The AGPL-3.0 itself allows commercial use and commercial redistribution. A person or company that fully complies with the AGPL-3.0 may commercially use or sell DuoChat without purchasing the separate commercial license or paying the commercial-license royalty. The commercial license is an alternative for proprietary use.

See the [full GNU AGPL v3 text](https://www.gnu.org/licenses/agpl-3.0.html) for the open-source terms.

For a commercial license, contact the repository owner through GitHub or the contact address listed in `COMMERCIAL_LICENSE.md`.

## Disclaimer

DuoChat is an independent and unofficial project. It is not affiliated with, endorsed by, or sponsored by OpenAI.

"OpenAI", "ChatGPT", and related marks belong to their respective owners. Use of DuoChat remains subject to the applicable ChatGPT and OpenAI terms.

---

<div align="center">
  <strong>DuoChat</strong><br>
  A simple local separation layer for sharing a ChatGPT session more cleanly.
</div>
