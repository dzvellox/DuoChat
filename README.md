<div align="center">
  <img src="./icons/icon-128.png" width="104" height="104" alt="DuoChat logo">
  <h1>DuoChat 1.5.0</h1>
  <p><strong>Private, local profiles for sharing one ChatGPT or Claude session without mixing conversations, projects, and personal organization.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-1.5.0-6558E8" alt="Version 1.5.0">
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/tests-29%20passed-13866F" alt="29 tests passed">
    <img src="https://img.shields.io/badge/storage-local%20only-2C8C76" alt="Local-only storage">
    <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial-5C5C68" alt="AGPL-3.0 and commercial license">
  </p>
</div>

> [!IMPORTANT]
> DuoChat is a **local browser separation layer**. It filters and protects the interface while the extension is active, but it does not create real OpenAI or Anthropic sub-accounts. Someone who can disable or remove the extension, use another Chrome profile, or access the same account from another device can bypass this local separation. For strong isolation between untrusted users, use separate browser profiles or separate provider accounts.

## What is DuoChat?

DuoChat lets multiple people or contexts — Personal, Work, Study, Development, Guest, Child, and more — share the same ChatGPT or Claude session while keeping their local workspace separated.

Version **1.5.0** is a major upgrade over 1.3.1. It turns DuoChat into a full local profile manager with profile locking, encrypted local storage, automatic assignment rules, a dashboard, per-profile favorites and metadata, direct-URL protection, backups, encrypted transfer, WebAuthn support, temporary profiles, permissions, privacy modes, and real-time synchronization across tabs and windows.

## What's new since 1.3.1

### 1.4.0 foundation

- First-run language selection.
- Multi-language interface.
- New Settings area.
- Safer recovery of old conversations and projects.
- Fixed old-project assignment so detected chats inside the project are assigned too.
- Removed the global legacy recovery switch that could expose items from another profile.
- Stronger hiding of unassigned and foreign project names.

### 1.5.0 major feature update

- Encrypted local vault with AES-256-GCM.
- Per-profile PIN/password protection.
- Recovery key.
- Automatic locking and startup locking.
- Panic Lock.
- Optional WebAuthn / Windows Hello / Touch ID / security-key verification.
- Direct conversation and project URL guards.
- Safe Links and SPA navigation protection.
- Global synchronization across tabs and windows.
- Automatic rules and smart assignment.
- Temporary, guest, child, decoy, and stealth profiles.
- Local administrator role and permissions.
- Profile schedules.
- Favorites, tags, folders, aliases, notes, collections, and Focus Mode.
- Privacy Blur, Presentation Mode, and Screenshot Mode.
- Full DuoChat Dashboard.
- Command Palette and customizable shortcuts.
- Bulk assignment and Smart Migration.
- Local activity and security logs.
- Automatic backups and Undo.
- Encrypted `.duochat` import/export.
- Local QR transfer, including encrypted multi-part QR transfer.
- Local statistics and cleanup tools.
- 29 automated checks passing.

## Features

### Profiles, locking, and privacy

- A different PIN or password for each profile.
- Startup lock: protected content stays hidden until authentication succeeds.
- Auto-lock after a configurable period of inactivity.
- Optional lock when Chromium reports the system session as locked.
- **Panic Lock** to immediately hide the current workspace and lock DuoChat.
- Logical DuoChat sign-out without signing out of ChatGPT or Claude.
- Extra validation when switching to a protected profile.
- Optional **WebAuthn / Windows Hello / Touch ID / FIDO2 security key** as a local second factor when supported by the browser and authenticator.
- **Stealth Mode** to hide locked profiles from normal profile lists.
- Optional **Decoy Profile** type.
- Temporary profiles that can expire after restart or after a configured number of hours.
- Access schedules based on days and hours.
- Child/simplified profiles with reduced UI and permissions.
- Independent profile name, avatar, accent, theme, language, and protection settings.

### Protection against navigation bypasses

DuoChat checks access at multiple points:

- sidebar clicks;
- direct conversation links;
- direct project links;
- browser Back/Forward navigation;
- `history.pushState()` and `history.replaceState()`;
- SPA URL changes;
- links opened from search results or provider pages;
- tabs and windows that were already open when the active profile changed.

When a URL points to an item owned by another profile, **Safe Links** can replace the sensitive route with a local access-denied state before showing the block screen. The protected content remains hidden and the tab title is also masked while authorization is being checked.

> [!NOTE]
> These protections apply to the browser layer controlled by DuoChat. They cannot stop a person from deliberately disabling the extension or accessing the same provider account in an environment where DuoChat is not installed.

### Conversations and projects

- Automatic assignment of newly created chats to the active profile.
- Automatic assignment rules based on project, provider, title text, or a default rule.
- Detection of newly created projects with an explicit owner-selection prompt.
- When an existing project is assigned, DuoChat also associates detected chats inside that project **without stealing** chats already assigned to another profile.
- Detection of unassigned conversations and projects.
- Bulk assignment for many items at once.
- **Smart Migration** that suggests likely owners using project relationships, rules, titles, and profile templates without reading message bodies.
- Cleanup tools for orphaned items, duplicate metadata, and inconsistent project/chat assignments.
- Private search limited to the currently active profile.

### Local organization

The following features are stored locally and do not change the original ChatGPT or Claude conversation data:

- per-profile favorites;
- tags;
- virtual folders;
- local aliases for conversations;
- local notes;
- hidden items;
- an additional PIN for especially sensitive conversations;
- smart collections such as Favorites, This Week, Unassigned, and Work;
- Focus Mode by project, tag, folder, or favorites;
- quick actions and bulk assignment from the Dashboard.

A conversation-level extra PIN uses its **own PBKDF2-derived verifier** inside the encrypted vault and does not need to match the profile password.

### Privacy modes

- **Privacy Blur**: blurs allowed conversation titles until hover/focus.
- **Presentation Mode**: hides personal information while screen sharing.
- **Screenshot Mode**: manually hides sensitive information before taking a screenshot.
- Per-profile hiding of selected ChatGPT/Claude interface features.
- External-domain whitelist for links shown inside ChatGPT/Claude.

Chrome does not expose a reliable universal event telling a normal extension that the operating system has just taken a screenshot. Screenshot Mode is therefore an explicit mode/shortcut rather than pretending to detect every screenshot automatically.

### DuoChat Dashboard

The Dashboard brings together:

- profiles and statistics;
- conversations and projects;
- favorites, tags, folders, aliases, and notes;
- automatic rules;
- Smart Migration;
- local activity and security logs;
- backups and Undo;
- profile configuration;
- permissions;
- Focus and privacy modes;
- transfer, export/import, and recovery;
- encryption and WebAuthn settings.

The local logs can record events such as creation, assignment, profile changes, or access attempts **without storing the content of messages**.

### Command Palette and shortcuts

Default shortcuts on ChatGPT/Claude:

- `Ctrl+K` — DuoChat Command Palette;
- `Alt+Shift+L` — lock DuoChat;
- `Alt+Shift+X` — Panic Lock;
- `Alt+Shift+P` — profile picker;
- `Alt+Shift+S` — Screenshot Mode.

Internal shortcuts for the palette, lock, panic, presentation, and screenshot actions can be customized per profile in the Dashboard. Chrome-level extension commands can also be changed from `chrome://extensions/shortcuts`.

### Multi-tab and multi-window synchronization

DuoChat uses one **active profile for the extension installation**. When the active profile changes:

- all open ChatGPT and Claude tabs are notified;
- all relevant browser windows are re-filtered;
- an old tab cannot silently keep displaying Profile A while another tab has switched to Profile B;
- Panic Lock and normal lock events are propagated across matching tabs.

No DuoChat server is required for this local synchronization.

## Encryption and recovery

### AES-256-GCM local vault

Private DuoChat data is stored inside a local vault protected with **AES-256-GCM**. The vault key is randomly generated and wrapped for authorized profiles.

PINs and passwords are never stored in plaintext. DuoChat uses PBKDF2-HMAC-SHA-256 with a per-profile salt and a high iteration count to derive the material used for authentication and key wrapping.

The vault includes assignments, rules, local metadata, notes, tags, and logs. ChatGPT/Claude messages themselves remain stored by their provider; DuoChat does not encrypt the remote OpenAI or Anthropic account.

### Recovery key

During the first encrypted setup, DuoChat generates a **recovery key**. Store it somewhere separate from the computer. It can recover the local DuoChat vault if a profile password is forgotten, but anyone who has the recovery key may also be able to recover the corresponding DuoChat data.

DuoChat has no server-side recovery service and cannot restore a lost recovery key for you.

### WebAuthn

A profile can optionally enable WebAuthn from the popup or Dashboard. Depending on the operating system and hardware, Chrome may offer Windows Hello, Touch ID, or a FIDO2 security key.

The private credential stays inside the authenticator. DuoChat stores only the public information needed for verification. To preserve the credential's secure extension origin, WebAuthn authentication should be initiated from the DuoChat extension UI rather than from a form injected directly into ChatGPT or Claude.

## Backups, Undo, and restore

DuoChat can create several local snapshots before important changes. From the Dashboard you can:

- view available backups;
- restore an older version;
- use **Undo — restore the previous state** after an incorrect bulk assignment;
- enable or disable automatic local backups;
- configure how many backup versions are retained.

Backups remain local to the browser and follow the same privacy model as the rest of DuoChat's data.

## Serverless transfer between computers

DuoChat supports three transfer methods.

### 1. DuoChat transfer code

The popup can generate a `DUOCHAT2.…` code that can be copied to another compatible DuoChat installation. Small configurations can also be displayed as a local QR code.

### 2. Encrypted `.duochat` file

The Dashboard can export the installation to a portable file protected by a passphrase. The file is encrypted before it is written and can be moved with a USB drive for a fully local **portable mode**.

### 3. Encrypted multi-part QR transfer

For configurations too large for a single QR code:

1. DuoChat creates the encrypted `.duochat` payload;
2. it splits the payload into multiple `DUOCHATQR1` segments;
3. every segment includes its order, total count, and checksum;
4. QR codes are generated **entirely locally**;
5. the receiving installation reassembles the segments and imports the payload with the passphrase.

No remote QR-generation service is used. The bundled QR generator is a local third-party dependency and its license notice is included in `vendor/QR-LICENSE.txt`.

> [!WARNING]
> A transfer code or backup contains sensitive configuration information. Keep it private and use a strong passphrase for portable encrypted exports.

## First-run setup wizard

On first launch, DuoChat guides the user through:

1. language selection;
2. number of profiles;
3. profile templates;
4. profile names and PINs/passwords;
5. initial active profile;
6. automatic-assignment and legacy-item options;
7. recovery-key generation/display.

Built-in templates include **Personal, Work, Study, Development, Temporary Guest, and Child/Simplified**.

## Local administrator mode and permissions

A profile can be marked as the local administrator. Depending on configured permissions, another profile may or may not be allowed to:

- create or modify projects;
- move or assign chats;
- change settings;
- export or import data;
- manage profiles;
- access specific Dashboard areas.

These permissions only control DuoChat locally. They do not modify the provider-side permissions of the ChatGPT or Claude account.

## Languages

DuoChat includes:

- English;
- French;
- Spanish;
- German;
- Italian;
- Portuguese.

The language can be selected during first-run setup and changed later in Settings. The main popup, protection screens, setup wizard, and Dashboard use the built-in translation system. Some technical labels intentionally keep their standard names, such as `WebAuthn`, `AES-256-GCM`, and `Smart Migration`.

## Local installation

DuoChat is a Manifest V3 Chrome extension.

1. Download or clone the repository.
2. Extract the ZIP archive if necessary.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the folder that directly contains `manifest.json`.
7. Pin DuoChat from the extensions menu.
8. Open `https://chatgpt.com/` or `https://claude.ai/`.

After updating the source files, reload DuoChat from `chrome://extensions`, then refresh any already-open ChatGPT or Claude tabs.

## Architecture

| File | Responsibility |
| --- | --- |
| `manifest.json` | Manifest V3 definition, permissions, hosts, extension commands |
| `core.js` | Data model, validation, cryptography, transfer format, profiles, rules |
| `background.js` | Vault, authentication, WebAuthn, assignment, backups, synchronization |
| `content.js` | Route guard, DOM filtering, protection screens, auto-assignment, command palette |
| `content.css` | Visual protection and Privacy/Presentation/Screenshot modes |
| `popup.*` | Profile switching, locking, WebAuthn, quick settings, transfer |
| `dashboard.*` | Administration, organization, rules, backups, statistics, import/export |
| `i18n.js` / `_locales/` | Translation system and Chrome locale messages |
| `vendor/duochat-qr.js` | Local QR-code generation |
| `tests/` | Core, manifest, migration, and security guardrail tests |

### Chrome permissions

- `storage` — store the local state and encrypted vault;
- `tabs` — propagate profile/lock changes to relevant open tabs;
- `idle` — detect system idle/locked state when available;
- `alarms` — local maintenance, auto-lock, and temporary-profile expiration;
- host access is limited to `https://chatgpt.com/*` and `https://claude.ai/*`.

DuoChat does not request access to every website you visit.

## Development and tests

Requirement: a recent Node.js version.

```bash
npm run check
```

The validation suite includes:

- syntax checks for the main JavaScript files;
- cryptography and migration tests;
- Manifest V3 tests;
- checks for the six supported languages;
- URL/history protection checks;
- WebAuthn wiring checks;
- Safe Links checks;
- extra conversation-PIN checks;
- encrypted QR transfer checks;
- checks preventing `eval` and remote script execution.

Current v1.5.0 validation status: **29 tests passed out of 29**.

> [!NOTE]
> Automated tests cannot emulate a real Windows Hello, Touch ID, or FIDO2 authenticator. WebAuthn integration is therefore checked programmatically and should also be manually tested in Chrome with real hardware before production publication.

## Known limitations and threat model

DuoChat is designed for practical privacy on **a shared browser where the extension remains installed and enabled**. It is not a server-side authorization system.

Important limitations:

- disabling or removing the extension removes its local protection;
- another Chrome profile or another device using the same provider account is not protected unless DuoChat is installed there too;
- ChatGPT and Claude remain responsible for the remote storage of their conversations;
- provider DOM structures can change and may require DuoChat selector updates;
- PC lock detection depends on what Chromium exposes through `chrome.idle`;
- recent-file cards and similar UI elements can only be assigned reliably when a conversation or project identifier is available in the page DOM;
- Screenshot Mode cannot reliably detect every screenshot taken by the operating system;
- local filtering is not a replacement for separate accounts when a real security boundary is required.

## Privacy

DuoChat 1.5.0 does not require a DuoChat backend:

- no remote DuoChat account;
- no Supabase or Firebase database;
- no built-in telemetry;
- no conversation content sent to a DuoChat server;
- no remotely executed scripts;
- QR codes generated locally;
- configuration, logs, and metadata remain local and are encrypted according to the installation state.

## License

The repository uses the **GNU AGPL v3** for open-source use, with a separate commercial licensing option described in `COMMERCIAL_LICENSE.md`.

The bundled QR component keeps its own license notice in `vendor/QR-LICENSE.txt`.

## Changelog

### 1.5.0

- AES-256-GCM local vault and recovery key.
- Per-profile PIN/passwords, optional WebAuthn, and optional extra conversation PINs.
- Local admin/permissions, temporary and child profiles, schedules, Stealth and Decoy modes.
- Stronger URL guard, Safe Links, project protection, multi-tab and multi-window synchronization.
- Rules, Smart Migration, bulk assignment, new-project detection, and unassigned-item detection.
- Favorites, tags, folders, notes, aliases, smart collections, and Focus Mode.
- Privacy Blur, Presentation Mode, Screenshot Mode, and Panic Lock.
- Full Dashboard, statistics, and local logs.
- Automatic backups, Undo, and intelligent cleanup.
- Encrypted `.duochat` import/export, local QR transfer, and encrypted multi-part QR transfer.
- Customizable shortcuts.
- Multi-profile first-run setup wizard.
- 29 automated tests passing.

### 1.4.0

- Language selection and internationalization.
- New Settings menu.
- Safer recovery of old items.
- Fixed old-project assignment so contained chats are assigned too.
- Removed the global recovery control that could reveal another profile's items.

### 1.3.1

- Unlimited local profiles.
- Per-profile password protection.
- Automatic chat/project assignment.
- Basic direct-access protection.
- Manual transfer code between computers.
- Local-only storage and no DuoChat backend.

---

DuoChat aims to provide a practical, private, serverless local experience while being transparent about the difference between **local interface separation** and **true account isolation**.
