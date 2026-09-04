# DuoChat Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately to **zvellox@gmail.com** rather than opening a public GitHub issue with exploit details.

Include, when possible:

- affected DuoChat version;
- affected browser and operating system;
- reproduction steps;
- expected and observed behavior;
- whether the issue can expose another DuoChat profile, bypass a lock, alter local ownership, or execute code.

## Security model

DuoChat is a local browser-extension separation layer. It is not a server-side OpenAI or Anthropic authorization boundary.

DuoChat is designed to protect local profile separation while the extension is installed, enabled, and controlling the supported ChatGPT/Claude page. A person who can disable/remove the extension, edit an unpacked installation, use another browser profile, or sign into the same provider account elsewhere can bypass the local layer.

## Core protections

- Manifest V3 and no remotely hosted executable code.
- Explicit extension-page Content Security Policy.
- AES-256-GCM encrypted local vault.
- PBKDF2-HMAC-SHA-256 password derivation with per-record salt and stored iteration count.
- Credential entry used by page guards occurs on an extension-origin page, not in the ChatGPT/Claude DOM.
- Content-script message allowlist and reduced snapshots.
- Direct URL, SPA navigation, history, project, and conversation guards.
- HTTPS-only external-domain allowlists.
- Local rate limiting for repeated authentication failures.
- SHA-256 and archive-path validation in the optional Windows updater.

## Donation/security note

DuoChat contains no payment API token or donation secret. The support button opens a validated public GitHub Sponsors destination. Because the project is open source, a person who intentionally modifies or forks the source can also change that destination; client-side obfuscation cannot form a trustworthy secret boundary.
