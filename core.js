(function initDuoChatCore(globalScope) {
  "use strict";

  const STORAGE_KEY = "duochatState";
  const SESSION_KEY = "duochatSession";
  const BACKUPS_KEY = "duochatBackups";
  const LANGUAGE_KEY = "duochatLanguage";
  const STATE_VERSION = 8;
  const PBKDF2_ITERATIONS = 600000;
  const MIN_PASSWORD_LENGTH = 6;
  const TRANSFER_CODE_PREFIX = "DUOCHAT2.";
  const LEGACY_TRANSFER_CODE_PREFIX = "DUOCHAT1.";
  const FILE_MAGIC = "DUOCHAT-FILE-1";
  const MAX_TRANSFER_CODE_LENGTH = 8_000_000;
  const MAX_LOG_ENTRIES = 500;
  const MAX_BACKUPS = 12;
  const DEFAULT_WHITELIST = ["chatgpt.com", "openai.com", "claude.ai", "anthropic.com"];

  const SUPPORTED_SITES = Object.freeze({
    chatgpt: Object.freeze({
      id: "chatgpt",
      name: "ChatGPT",
      origin: "https://chatgpt.com",
      homeUrl: "https://chatgpt.com/"
    }),
    claude: Object.freeze({
      id: "claude",
      name: "Claude",
      origin: "https://claude.ai",
      homeUrl: "https://claude.ai/new"
    })
  });

  const PROFILE_TEMPLATES = Object.freeze({
    personal: Object.freeze({
      id: "personal",
      name: "Personnel",
      role: "member",
      permissions: ["create_projects", "move_chats", "manage_own_metadata", "access_settings", "export_own"],
      hiddenFunctions: []
    }),
    work: Object.freeze({
      id: "work",
      name: "Travail",
      role: "member",
      permissions: ["create_projects", "move_chats", "manage_own_metadata", "access_settings", "export_own"],
      hiddenFunctions: []
    }),
    study: Object.freeze({
      id: "study",
      name: "Études",
      role: "member",
      permissions: ["create_projects", "move_chats", "manage_own_metadata", "access_settings"],
      hiddenFunctions: ["apps"]
    }),
    development: Object.freeze({
      id: "development",
      name: "Développement",
      role: "member",
      permissions: ["create_projects", "move_chats", "manage_own_metadata", "access_settings", "export_own"],
      hiddenFunctions: []
    }),
    guest: Object.freeze({
      id: "guest",
      name: "Invité",
      role: "guest",
      permissions: ["manage_own_metadata"],
      hiddenFunctions: ["apps", "gpts", "settings", "share", "files", "projects_create"]
    }),
    child: Object.freeze({
      id: "child",
      name: "Enfant",
      role: "child",
      permissions: ["manage_own_metadata"],
      hiddenFunctions: ["apps", "gpts", "settings", "share", "files", "projects_create", "external_links"]
    })
  });

  const DEFAULT_PERMISSIONS = Object.freeze([
    "create_projects",
    "move_chats",
    "manage_own_metadata",
    "access_settings",
    "export_own"
  ]);

  function bytesToBase64(bytes) {
    if (typeof btoa === "function") {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }
    return Buffer.from(bytes).toString("base64");
  }

  function base64ToBytes(value) {
    if (typeof atob === "function") {
      const binary = atob(String(value || ""));
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    return Uint8Array.from(Buffer.from(String(value || ""), "base64"));
  }

  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function base64UrlToBytes(value) {
    let normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
    while (normalized.length % 4) normalized += "=";
    return base64ToBytes(normalized);
  }

  function utf8ToBase64Url(text) {
    return bytesToBase64Url(new TextEncoder().encode(String(text)));
  }

  function base64UrlToUtf8(value) {
    return new TextDecoder().decode(base64UrlToBytes(value));
  }

  function sanitizeName(value, fallback = "Profil") {
    const normalized = String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
    return normalized || fallback;
  }

  function sanitizeText(value, max = 500) {
    return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
  }

  function sanitizeTag(value) {
    return sanitizeText(value, 28).replace(/[<>]/g, "");
  }

  function sanitizeColor(value, fallback = "#7667F5") {
    const candidate = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
  }

  function normalizeDomain(value) {
    let candidate = String(value || "").trim().toLowerCase().replace(/^\*\./, "");
    if (!candidate) return "";
    try {
      if (candidate.includes("://")) candidate = new URL(candidate).hostname.toLowerCase();
    } catch (_error) { return ""; }
    candidate = candidate.replace(/\.$/, "");
    if (candidate.length > 253 || !candidate.includes(".")) return "";
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(candidate)) return "";
    return candidate;
  }

  function sanitizeEntityUrl(value, kind = null, expectedId = null) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:") return "";
      const site = getSupportedSite(url.href);
      if (!site) return "";
      url.username = "";
      url.password = "";
      url.hash = "";
      if (kind === "conversation" || kind === "project") {
        const extracted = kind === "conversation" ? extractConversationId(url.href) : extractProjectId(url.href);
        if (!extracted) return "";
        if (expectedId && extracted !== expectedId) return "";
      }
      return url.href.slice(0, 500);
    } catch (_error) {
      return "";
    }
  }

  function isValidProfileId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
  }

  function isValidPassword(value) {
    return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;
  }

  function createProfileId(existingProfiles = {}) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      const id = `p_${bytesToBase64Url(bytes)}`;
      if (!existingProfiles[id]) return id;
    }
    throw new Error("PROFILE_ID_GENERATION_FAILED");
  }

  function createId(prefix = "id") {
    return `${prefix}_${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(10)))}`;
  }

  function getProfileIds(candidate) {
    const profiles = candidate && candidate.profiles && typeof candidate.profiles === "object"
      ? candidate.profiles
      : {};
    const ordered = Array.isArray(candidate && candidate.profileOrder)
      ? candidate.profileOrder.filter((id) => isValidProfileId(id) && profiles[id])
      : [];
    for (const id of Object.keys(profiles)) {
      if (isValidProfileId(id) && !ordered.includes(id)) ordered.push(id);
    }
    return ordered;
  }

  function getSupportedSite(input) {
    try {
      const url = new URL(String(input), "https://chatgpt.com");
      return Object.values(SUPPORTED_SITES).find((site) => site.origin === url.origin) || null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeEntityId(value, defaultSiteId = "chatgpt", stripChatGptProjectPrefix = false) {
    const normalized = String(value || "").trim();
    const scopedMatch = normalized.match(/^(chatgpt|claude):(.+)$/);
    const siteId = scopedMatch ? scopedMatch[1] : defaultSiteId;
    if (!SUPPORTED_SITES[siteId]) return null;
    let rawId = scopedMatch ? scopedMatch[2] : normalized;
    if (stripChatGptProjectPrefix && siteId === "chatgpt" && rawId.startsWith("g-p-")) rawId = rawId.slice(4);
    if (!/^[a-zA-Z0-9_-]{6,180}$/.test(rawId)) return null;
    return `${siteId}:${rawId}`;
  }

  function normalizeConversationId(value, defaultSiteId = "chatgpt") {
    return normalizeEntityId(value, defaultSiteId, false);
  }

  function normalizeProjectId(value, defaultSiteId = "chatgpt") {
    return normalizeEntityId(value, defaultSiteId, true);
  }

  function extractConversationId(input) {
    try {
      const url = new URL(String(input), "https://chatgpt.com");
      const site = getSupportedSite(url.href);
      if (!site) return null;
      const pattern = site.id === "chatgpt"
        ? /(?:^|\/)c\/([a-zA-Z0-9_-]{6,180})(?:\/|$)/
        : /(?:^|\/)chat\/([a-zA-Z0-9_-]{6,180})(?:\/|$)/;
      const match = url.pathname.match(pattern);
      return match ? normalizeConversationId(match[1], site.id) : null;
    } catch (_error) {
      return null;
    }
  }

  function extractProjectId(input) {
    try {
      const url = new URL(String(input), "https://chatgpt.com");
      const site = getSupportedSite(url.href);
      if (!site) return null;
      const queryId = url.searchParams.get("project_id") || url.searchParams.get("projectId");
      if (queryId) return normalizeProjectId(queryId, site.id);
      if (site.id === "chatgpt") {
        const prefixedMatch = url.pathname.match(/(?:^|\/)(g-p-[a-zA-Z0-9_-]{6,180})(?:\/|$)/);
        if (prefixedMatch) return normalizeProjectId(prefixedMatch[1], site.id);
      }
      const routeMatch = url.pathname.match(/(?:^|\/)projects?\/([a-zA-Z0-9_-]{6,180})(?:\/|$)/);
      return routeMatch ? normalizeProjectId(routeMatch[1], site.id) : null;
    } catch (_error) {
      return null;
    }
  }

  async function derivePasswordBits(password, salt, iterations = PBKDF2_ITERATIONS) {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey("raw", encoder.encode(String(password)), "PBKDF2", false, ["deriveBits", "deriveKey"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      256
    );
    return new Uint8Array(bits);
  }

  async function deriveAesKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(passphrase)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function importAesKey(rawBytes) {
    return crypto.subtle.importKey("raw", rawBytes, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function createCredential(password) {
    if (!isValidPassword(password)) throw new Error("PASSWORD_TOO_SHORT");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePasswordBits(password, salt);
    return {
      algorithm: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(hash)
    };
  }

  function constantTimeEqual(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
  }

  async function verifyCredential(password, credential) {
    if (!credential || credential.algorithm !== "PBKDF2-SHA256" || !isValidPassword(password)) return false;
    try {
      const expected = base64ToBytes(credential.hash);
      const actual = await derivePasswordBits(password, base64ToBytes(credential.salt), credential.iterations || PBKDF2_ITERATIONS);
      return constantTimeEqual(actual, expected);
    } catch (_error) {
      return false;
    }
  }

  async function wrapVaultKey(vaultKeyBytes, passphrase) {
    if (!isValidPassword(passphrase)) throw new Error("PASSWORD_TOO_SHORT");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(passphrase, salt);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, vaultKeyBytes));
    return {
      algorithm: "AES-GCM-256",
      kdf: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  async function unwrapVaultKey(wrap, passphrase) {
    if (!wrap || wrap.algorithm !== "AES-GCM-256") throw new Error("INVALID_VAULT_WRAP");
    try {
      const key = await deriveAesKey(passphrase, base64ToBytes(wrap.salt), wrap.iterations || PBKDF2_ITERATIONS);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(wrap.iv) },
        key,
        base64ToBytes(wrap.ciphertext)
      );
      const bytes = new Uint8Array(plain);
      if (bytes.length !== 32) throw new Error("INVALID_VAULT_KEY");
      return bytes;
    } catch (_error) {
      throw new Error("WRONG_PASSWORD");
    }
  }

  async function encryptJsonWithRawKey(value, rawKeyBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await importAesKey(rawKeyBytes);
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
    return {
      algorithm: "AES-GCM-256",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(cipher)
    };
  }

  async function decryptJsonWithRawKey(payload, rawKeyBytes) {
    if (!payload || payload.algorithm !== "AES-GCM-256") throw new Error("INVALID_ENCRYPTED_PAYLOAD");
    try {
      const key = await importAesKey(rawKeyBytes);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
        key,
        base64ToBytes(payload.ciphertext)
      );
      return JSON.parse(new TextDecoder().decode(new Uint8Array(plain)));
    } catch (_error) {
      throw new Error("DECRYPTION_FAILED");
    }
  }

  function generateRecoveryKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    return hex.match(/.{1,8}/g).join("-");
  }

  function defaultSchedule() {
    return { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" };
  }

  function normalizeSchedule(value) {
    const source = value && typeof value === "object" ? value : {};
    const days = Array.isArray(source.days)
      ? [...new Set(source.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [0, 1, 2, 3, 4, 5, 6];
    const validTime = (text, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(text || "")) ? String(text) : fallback;
    return {
      enabled: source.enabled === true,
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      start: validTime(source.start, "00:00"),
      end: validTime(source.end, "23:59")
    };
  }

  function isScheduleAllowed(schedule, date = new Date()) {
    const normalized = normalizeSchedule(schedule);
    if (!normalized.enabled) return true;
    if (!normalized.days.includes(date.getDay())) return false;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const [startH, startM] = normalized.start.split(":").map(Number);
    const [endH, endM] = normalized.end.split(":").map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (start <= end) return minutes >= start && minutes <= end;
    return minutes >= start || minutes <= end;
  }

  function normalizeTemporary(value) {
    if (!value || typeof value !== "object") return null;
    const mode = ["session", "hours"].includes(value.mode) ? value.mode : null;
    if (!mode) return null;
    const expiresAt = mode === "hours" && Number.isFinite(value.expiresAt) ? Number(value.expiresAt) : null;
    return { mode, expiresAt, expired: value.expired === true };
  }

  function normalizeProfileHeader(id, profile, index = 0) {
    const source = profile && typeof profile === "object" ? profile : {};
    const templateId = PROFILE_TEMPLATES[source.template] ? source.template : "personal";
    const template = PROFILE_TEMPLATES[templateId];
    return {
      id,
      name: sanitizeName(source.name, `Utilisateur ${index + 1}`),
      credential: source.credential || null,
      vaultWrap: source.vaultWrap || null,
      role: source.role === "admin" ? "admin" : (source.role || template.role || "member"),
      template: templateId,
      avatar: sanitizeText(source.avatar, 4) || "",
      accent: sanitizeColor(source.accent, "#7667F5"),
      createdAt: Number.isFinite(source.createdAt) ? source.createdAt : Date.now(),
      temporary: normalizeTemporary(source.temporary),
      schedule: normalizeSchedule(source.schedule),
      stealth: source.stealth === true,
      decoy: source.decoy === true,
      webauthn: source.webauthn && typeof source.webauthn === "object" && source.webauthn.enabled === true
        ? {
            enabled: true,
            credentialId: sanitizeText(source.webauthn.credentialId, 1024),
            publicKeySpki: sanitizeText(source.webauthn.publicKeySpki, 4096),
            algorithm: Number(source.webauthn.algorithm) === -7 ? -7 : -7,
            createdAt: Number.isFinite(source.webauthn.createdAt) ? Number(source.webauthn.createdAt) : Date.now()
          }
        : null
    };
  }

  function createEmptyVault() {
    return {
      conversationOwners: {},
      projectOwners: {},
      conversationMeta: {},
      projectMeta: {},
      profileSettings: {},
      rules: [],
      globalSettings: {
        autoAssignNew: true,
        promptUnassigned: true,
        syncAllTabs: true,
        localBackups: true,
        backupLimit: MAX_BACKUPS
      },
      activityLog: [],
      securityLog: []
    };
  }

  function normalizeOwnerMap(candidate, profiles, kind) {
    const output = {};
    if (!candidate || typeof candidate !== "object") return output;
    for (const [rawId, owner] of Object.entries(candidate)) {
      const id = kind === "project" ? normalizeProjectId(rawId) : normalizeConversationId(rawId);
      if (id && profiles[owner]) output[id] = owner;
    }
    return output;
  }

  function normalizeMetaMap(candidate, kind, owners) {
    const output = {};
    if (!candidate || typeof candidate !== "object") return output;
    for (const [rawId, rawMeta] of Object.entries(candidate)) {
      const id = kind === "project" ? normalizeProjectId(rawId) : normalizeConversationId(rawId);
      if (!id || !rawMeta || typeof rawMeta !== "object") continue;
      const tags = Array.isArray(rawMeta.tags)
        ? [...new Set(rawMeta.tags.map(sanitizeTag).filter(Boolean))].slice(0, 20)
        : [];
      output[id] = {
        title: sanitizeText(rawMeta.title, 160),
        alias: sanitizeText(rawMeta.alias, 160),
        favorite: rawMeta.favorite === true,
        hidden: rawMeta.hidden === true,
        extraLock: rawMeta.extraLock === true,
        extraLockCredential: rawMeta.extraLockCredential && rawMeta.extraLockCredential.algorithm === "PBKDF2-SHA256"
          ? {
              algorithm: "PBKDF2-SHA256",
              iterations: Number(rawMeta.extraLockCredential.iterations) || PBKDF2_ITERATIONS,
              salt: sanitizeText(rawMeta.extraLockCredential.salt, 256),
              hash: sanitizeText(rawMeta.extraLockCredential.hash, 256)
            }
          : null,
        tags,
        folder: sanitizeText(rawMeta.folder, 80),
        note: sanitizeText(rawMeta.note, 4000),
        projectId: kind === "conversation" ? normalizeProjectId(rawMeta.projectId || "") : null,
        createdAt: Number.isFinite(rawMeta.createdAt) ? Number(rawMeta.createdAt) : null,
        lastSeenAt: Number.isFinite(rawMeta.lastSeenAt) ? Number(rawMeta.lastSeenAt) : null,
        updatedAt: Number.isFinite(rawMeta.updatedAt) ? Number(rawMeta.updatedAt) : null,
        url: sanitizeEntityUrl(rawMeta.url, kind, id),
        ownerId: owners[id] || null
      };
    }
    return output;
  }

  function normalizeProfileSettings(candidate, profiles) {
    const output = {};
    const source = candidate && typeof candidate === "object" ? candidate : {};
    for (const [id, profile] of Object.entries(profiles)) {
      const raw = source[id] && typeof source[id] === "object" ? source[id] : {};
      const template = PROFILE_TEMPLATES[profile.template] || PROFILE_TEMPLATES.personal;
      const permissions = Array.isArray(raw.permissions)
        ? [...new Set(raw.permissions.map((item) => sanitizeText(item, 48)).filter(Boolean))]
        : [...template.permissions || DEFAULT_PERMISSIONS];
      if (profile.role === "admin") {
        for (const permission of ["admin", "access_settings", "manage_profiles", "manage_rules", "manage_global", "bulk_assign", "export_all", "view_logs", "cleanup"]) {
          if (!permissions.includes(permission)) permissions.push(permission);
        }
      }
      const hiddenFunctions = Array.isArray(raw.hiddenFunctions)
        ? [...new Set(raw.hiddenFunctions.map((item) => sanitizeText(item, 48)).filter(Boolean))]
        : [...template.hiddenFunctions];
      const whitelist = Array.isArray(raw.externalDomains)
        ? [...new Set(raw.externalDomains.map(normalizeDomain).filter(Boolean))].slice(0, 100)
        : [...DEFAULT_WHITELIST];
      output[id] = {
        language: ["fr", "en", "es", "de", "it", "pt"].includes(String(raw.language || "").toLowerCase()) ? String(raw.language).toLowerCase() : null,
        theme: ["system", "dark", "light"].includes(raw.theme) ? raw.theme : "system",
        accent: sanitizeColor(raw.accent || profile.accent, profile.accent),
        privacyBlur: raw.privacyBlur === true,
        blurDelayMs: Math.min(5000, Math.max(0, Number.isFinite(Number(raw.blurDelayMs)) ? Number(raw.blurDelayMs) : 0)),
        autoLockMinutes: Math.min(240, Math.max(0, Number.isFinite(Number(raw.autoLockMinutes)) ? Number(raw.autoLockMinutes) : 15)),
        lockOnSystemLock: raw.lockOnSystemLock !== false,
        switchRequiresPassword: raw.switchRequiresPassword !== false,
        permissions,
        hiddenFunctions,
        externalDomains: whitelist,
        focusMode: raw.focusMode && typeof raw.focusMode === "object"
          ? {
              enabled: raw.focusMode.enabled === true,
              type: ["project", "tag", "folder", "favorites"].includes(raw.focusMode.type) ? raw.focusMode.type : "project",
              value: sanitizeText(raw.focusMode.value, 180)
            }
          : { enabled: false, type: "project", value: "" },
        simplified: raw.simplified === true || profile.role === "child" || profile.role === "guest",
        panicNavigateHome: raw.panicNavigateHome !== false,
        screenshotMaskProfileName: raw.screenshotMaskProfileName !== false,
        shortcuts: {
          palette: sanitizeText(raw.shortcuts && raw.shortcuts.palette, 40) || "Ctrl+K",
          panic: sanitizeText(raw.shortcuts && raw.shortcuts.panic, 40) || "Alt+Shift+X",
          presentation: sanitizeText(raw.shortcuts && raw.shortcuts.presentation, 40) || "Alt+Shift+V",
          screenshot: sanitizeText(raw.shortcuts && raw.shortcuts.screenshot, 40) || "Alt+Shift+S",
          lock: sanitizeText(raw.shortcuts && raw.shortcuts.lock, 40) || "Alt+Shift+L"
        }
      };
    }
    return output;
  }

  function normalizeRule(raw, profiles) {
    if (!raw || typeof raw !== "object" || !profiles[raw.profileId]) return null;
    const type = ["project", "site", "title_contains", "default_new"].includes(raw.type) ? raw.type : null;
    if (!type) return null;
    return {
      id: isValidProfileId(raw.id) ? raw.id : createId("rule"),
      type,
      profileId: raw.profileId,
      projectId: type === "project" ? normalizeProjectId(raw.projectId || "") : null,
      siteId: type === "site" && SUPPORTED_SITES[raw.siteId] ? raw.siteId : null,
      contains: type === "title_contains" ? sanitizeText(raw.contains, 80).toLowerCase() : "",
      enabled: raw.enabled !== false,
      priority: Math.min(1000, Math.max(-1000, Number(raw.priority) || 0))
    };
  }

  function normalizeLog(candidate) {
    if (!Array.isArray(candidate)) return [];
    return candidate.slice(-MAX_LOG_ENTRIES).map((entry) => ({
      id: sanitizeText(entry && entry.id, 64) || createId("log"),
      ts: Number.isFinite(entry && entry.ts) ? Number(entry.ts) : Date.now(),
      profileId: isValidProfileId(entry && entry.profileId) ? entry.profileId : null,
      action: sanitizeText(entry && entry.action, 80),
      entityType: sanitizeText(entry && entry.entityType, 40),
      entityId: sanitizeText(entry && entry.entityId, 220),
      detail: sanitizeText(entry && entry.detail, 240)
    }));
  }

  function normalizeVault(candidate, profiles = {}) {
    const base = createEmptyVault();
    const source = candidate && typeof candidate === "object" ? candidate : {};
    base.conversationOwners = normalizeOwnerMap(source.conversationOwners, profiles, "conversation");
    base.projectOwners = normalizeOwnerMap(source.projectOwners, profiles, "project");
    base.conversationMeta = normalizeMetaMap(source.conversationMeta, "conversation", base.conversationOwners);
    base.projectMeta = normalizeMetaMap(source.projectMeta, "project", base.projectOwners);
    base.profileSettings = normalizeProfileSettings(source.profileSettings, profiles);
    base.rules = Array.isArray(source.rules)
      ? source.rules.map((rule) => normalizeRule(rule, profiles)).filter(Boolean).sort((a, b) => b.priority - a.priority).slice(0, 500)
      : [];
    if (source.globalSettings && typeof source.globalSettings === "object") {
      base.globalSettings = {
        autoAssignNew: source.globalSettings.autoAssignNew !== false,
        promptUnassigned: source.globalSettings.promptUnassigned !== false,
        syncAllTabs: source.globalSettings.syncAllTabs !== false,
        localBackups: source.globalSettings.localBackups !== false,
        backupLimit: Math.min(MAX_BACKUPS, Math.max(1, Number(source.globalSettings.backupLimit) || MAX_BACKUPS))
      };
    }
    base.activityLog = normalizeLog(source.activityLog);
    base.securityLog = normalizeLog(source.securityLog);
    return base;
  }

  function createEmptyState() {
    return {
      version: STATE_VERSION,
      configured: false,
      activeProfileId: null,
      profiles: {},
      profileOrder: [],
      encryption: { enabled: false, encryptedVault: null, recoveryWrap: null },
      legacyVault: createEmptyVault(),
      createdAt: null,
      updatedAt: null
    };
  }

  function normalizeState(candidate) {
    const empty = createEmptyState();
    if (!candidate || typeof candidate !== "object") return empty;

    // Legacy 1.3/1.4 state is kept readable and migratable.
    const legacy = Number(candidate.version) < STATE_VERSION || (!candidate.encryption && (candidate.conversationOwners || candidate.projectOwners));
    const profiles = {};
    if (candidate.profiles && typeof candidate.profiles === "object") {
      let index = 0;
      for (const [id, profile] of Object.entries(candidate.profiles)) {
        if (!isValidProfileId(id) || !profile || !profile.credential) continue;
        profiles[id] = normalizeProfileHeader(id, profile, index++);
      }
    }
    const profileOrder = getProfileIds({ profiles, profileOrder: candidate.profileOrder });
    if (profileOrder.length && !Object.values(profiles).some((profile) => profile.role === "admin")) {
      profiles[profileOrder[0]].role = "admin";
    }
    const configured = candidate.configured === true && profileOrder.length >= 1;
    const activeProfileId = profiles[candidate.activeProfileId] ? candidate.activeProfileId : profileOrder[0] || null;

    if (legacy) {
      const legacyVault = normalizeVault({
        conversationOwners: candidate.conversationOwners,
        projectOwners: candidate.projectOwners,
        conversationMeta: candidate.conversationMeta,
        projectMeta: candidate.projectMeta,
        profileSettings: candidate.profileSettings,
        rules: candidate.rules,
        globalSettings: candidate.globalSettings,
        activityLog: candidate.activityLog,
        securityLog: candidate.securityLog
      }, profiles);
      return {
        version: STATE_VERSION,
        configured,
        activeProfileId,
        profiles,
        profileOrder,
        encryption: { enabled: false, encryptedVault: null, recoveryWrap: null },
        legacyVault,
        createdAt: Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now(),
        updatedAt: Date.now(),
        migratedFrom: Number(candidate.version) || 5
      };
    }

    return {
      version: STATE_VERSION,
      configured,
      activeProfileId,
      profiles,
      profileOrder,
      encryption: {
        enabled: candidate.encryption && candidate.encryption.enabled === true,
        encryptedVault: candidate.encryption && candidate.encryption.encryptedVault ? candidate.encryption.encryptedVault : null,
        recoveryWrap: candidate.encryption && candidate.encryption.recoveryWrap ? candidate.encryption.recoveryWrap : null
      },
      legacyVault: candidate.encryption && candidate.encryption.enabled === true
        ? null
        : normalizeVault(candidate.legacyVault, profiles),
      createdAt: Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now(),
      updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : Date.now()
    };
  }

  function profilePublic(profile, locked = false) {
    return {
      id: profile.id,
      name: locked && profile.stealth ? "Profil verrouillé" : profile.name,
      role: profile.role,
      template: profile.template,
      avatar: locked && profile.stealth ? "" : profile.avatar,
      accent: profile.accent,
      temporary: profile.temporary,
      schedule: profile.schedule,
      stealth: profile.stealth,
      decoy: profile.decoy,
      webauthnEnabled: Boolean(profile.webauthn && profile.webauthn.enabled)
    };
  }

  function transferCodeFromState(candidate) {
    const state = normalizeState(candidate);
    if (!state.configured) throw new Error("NOT_CONFIGURED");
    const portable = { format: 2, exportedAt: new Date().toISOString(), state };
    const encoded = `${TRANSFER_CODE_PREFIX}${utf8ToBase64Url(JSON.stringify(portable))}`;
    if (encoded.length > MAX_TRANSFER_CODE_LENGTH) throw new Error("TRANSFER_CODE_TOO_LARGE");
    return encoded;
  }

  function legacyTransferCodeToState(code) {
    try {
      const encoded = String(code || "").slice(LEGACY_TRANSFER_CODE_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
      let padded = encoded;
      while (padded.length % 4) padded += "=";
      const json = typeof atob === "function" ? decodeURIComponent(escape(atob(padded))) : Buffer.from(padded, "base64").toString("utf8");
      const portable = JSON.parse(json);
      return normalizeState({
        version: 5,
        configured: true,
        activeProfileId: portable.profileOrder && portable.profileOrder[0],
        profiles: portable.profiles,
        profileOrder: portable.profileOrder,
        conversationOwners: portable.conversationOwners,
        projectOwners: portable.projectOwners
      });
    } catch (_error) {
      throw new Error("INVALID_TRANSFER_CODE");
    }
  }

  function transferCodeToState(code) {
    const raw = String(code || "").trim();
    if (raw.length > MAX_TRANSFER_CODE_LENGTH) throw new Error("INVALID_TRANSFER_CODE");
    if (raw.startsWith(LEGACY_TRANSFER_CODE_PREFIX)) return legacyTransferCodeToState(raw);
    if (!raw.startsWith(TRANSFER_CODE_PREFIX)) throw new Error("INVALID_TRANSFER_CODE");
    try {
      const portable = JSON.parse(base64UrlToUtf8(raw.slice(TRANSFER_CODE_PREFIX.length)));
      if (!portable || portable.format !== 2 || !portable.state) throw new Error("INVALID_TRANSFER_CODE");
      const state = normalizeState(portable.state);
      if (!state.configured) throw new Error("INVALID_TRANSFER_CODE");
      return state;
    } catch (error) {
      if (error && error.message === "INVALID_TRANSFER_CODE") throw error;
      throw new Error("INVALID_TRANSFER_CODE");
    }
  }

  async function encryptPortableBundle(bundle, passphrase) {
    if (!isValidPassword(passphrase)) throw new Error("PASSWORD_TOO_SHORT");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(passphrase, salt);
    const plain = new TextEncoder().encode(JSON.stringify(bundle));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
    return JSON.stringify({
      magic: FILE_MAGIC,
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      cipher: "AES-GCM-256",
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    });
  }

  async function decryptPortableBundle(text, passphrase) {
    try {
      const file = JSON.parse(String(text || ""));
      if (!file || file.magic !== FILE_MAGIC || file.cipher !== "AES-GCM-256") throw new Error("INVALID_DUOCHAT_FILE");
      const key = await deriveAesKey(passphrase, base64ToBytes(file.salt), file.iterations || PBKDF2_ITERATIONS);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(file.iv) },
        key,
        base64ToBytes(file.ciphertext)
      );
      return JSON.parse(new TextDecoder().decode(new Uint8Array(plain)));
    } catch (error) {
      if (error && error.message === "INVALID_DUOCHAT_FILE") throw error;
      throw new Error("WRONG_EXPORT_PASSWORD");
    }
  }

  function isDomainAllowed(url, allowedDomains) {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== "https:") return false;
      const host = parsed.hostname.toLowerCase();
      return (allowedDomains || []).some((rawDomain) => {
        const domain = normalizeDomain(rawDomain);
        return domain && (host === domain || host.endsWith(`.${domain}`));
      });
    } catch (_error) {
      return false;
    }
  }

  function addLog(log, entry) {
    const next = Array.isArray(log) ? [...log] : [];
    next.push({
      id: createId("log"),
      ts: Date.now(),
      profileId: isValidProfileId(entry && entry.profileId) ? entry.profileId : null,
      action: sanitizeText(entry && entry.action, 80),
      entityType: sanitizeText(entry && entry.entityType, 40),
      entityId: sanitizeText(entry && entry.entityId, 220),
      detail: sanitizeText(entry && entry.detail, 240)
    });
    return next.slice(-MAX_LOG_ENTRIES);
  }

  const api = Object.freeze({
    STORAGE_KEY,
    SESSION_KEY,
    BACKUPS_KEY,
    LANGUAGE_KEY,
    STATE_VERSION,
    PBKDF2_ITERATIONS,
    MIN_PASSWORD_LENGTH,
    TRANSFER_CODE_PREFIX,
    LEGACY_TRANSFER_CODE_PREFIX,
    FILE_MAGIC,
    MAX_TRANSFER_CODE_LENGTH,
    MAX_LOG_ENTRIES,
    MAX_BACKUPS,
    DEFAULT_WHITELIST,
    SUPPORTED_SITES,
    PROFILE_TEMPLATES,
    DEFAULT_PERMISSIONS,
    bytesToBase64,
    base64ToBytes,
    bytesToBase64Url,
    base64UrlToBytes,
    utf8ToBase64Url,
    base64UrlToUtf8,
    sanitizeName,
    sanitizeText,
    sanitizeTag,
    sanitizeColor,
    normalizeDomain,
    sanitizeEntityUrl,
    isValidProfileId,
    isValidPassword,
    createProfileId,
    createId,
    getProfileIds,
    getSupportedSite,
    extractConversationId,
    normalizeConversationId,
    extractProjectId,
    normalizeProjectId,
    createCredential,
    verifyCredential,
    wrapVaultKey,
    unwrapVaultKey,
    encryptJsonWithRawKey,
    decryptJsonWithRawKey,
    generateRecoveryKey,
    defaultSchedule,
    normalizeSchedule,
    isScheduleAllowed,
    normalizeTemporary,
    normalizeProfileHeader,
    createEmptyVault,
    normalizeVault,
    createEmptyState,
    normalizeState,
    profilePublic,
    transferCodeFromState,
    transferCodeToState,
    encryptPortableBundle,
    decryptPortableBundle,
    isDomainAllowed,
    addLog
  });

  globalScope.DuoChatCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
