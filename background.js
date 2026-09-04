"use strict";

importScripts("core.js", "i18n.js");

const C = self.DuoChatCore;
const I = self.DuoChatI18n;
let operationQueue = Promise.resolve();

const SECURE_REQUESTS_KEY = "__duochat_secure_requests_v1";
const FOREIGN_OWNER = "__duochat_foreign__";
const EXTENSION_ORIGIN_PREFIX = chrome.runtime.getURL("");
const SUPPORT_LINK_B64_PARTS = Object.freeze([
  "aHR0cHM6Ly9naXRodWIuY29tL3Nw",
  "b25zb3JzL2R6dmVsbG94"
]);
const SUPPORT_LINK_SHA256_PARTS = Object.freeze([
  "75b4b185d3357dcb",
  "b5c1ad598e138a9a",
  "82e0865bf4c65fb8",
  "cf8cb7c793eed0c7"
]);

function senderContext(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return "unauthorized";
  const senderUrl = String(sender.url || "");
  if (senderUrl.startsWith(EXTENSION_ORIGIN_PREFIX)) return "extension";
  if (C.getSupportedSite(senderUrl)) return "content";
  return "unknown";
}

const CONTENT_ALLOWED_MESSAGES = new Set([
  "GET_SNAPSHOT", "GET_LANGUAGE", "SET_LANGUAGE", "LOCK", "LOGICAL_LOGOUT", "PANIC_LOCK",
  "CLAIM_CONVERSATION", "CLAIM_CONVERSATIONS", "CLAIM_PROJECT", "CLAIM_PROJECTS",
  "CLAIM_PROJECT_WITH_CONVERSATIONS", "AUTO_ASSIGN_ENTITY", "RECORD_UNASSIGNED_ENTITY",
  "UPSERT_ENTITY_META", "RECORD_SECURITY_EVENT", "SET_MODE", "OPEN_DASHBOARD_REQUEST",
  "USER_ACTIVITY", "TOGGLE_FAVORITE", "OPEN_SECURE_AUTH"
]);

function assertMessageContext(message, context) {
  const type = message && message.type;
  if (!type || context === "unauthorized" || context === "unknown") throw new Error("UNAUTHORIZED_SENDER");
  if (context === "content" && !CONTENT_ALLOWED_MESSAGES.has(type)) throw new Error("CONTENT_ACTION_NOT_ALLOWED");
}

function redactSnapshotForContent(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const activeId = snapshot.activeProfileId;
  const profiles = {};
  if (snapshot.unlocked && activeId && snapshot.profiles && snapshot.profiles[activeId]) profiles[activeId] = snapshot.profiles[activeId];
  const redactOwners = (owners) => Object.fromEntries(Object.entries(owners || {}).map(([id, owner]) => [id, owner === activeId ? activeId : FOREIGN_OWNER]));
  return {
    ...snapshot,
    profiles,
    profileOrder: activeId && profiles[activeId] ? [activeId] : [],
    conversationOwners: snapshot.unlocked ? redactOwners(snapshot.conversationOwners) : {},
    projectOwners: snapshot.unlocked ? redactOwners(snapshot.projectOwners) : {},
    rules: [],
    globalSettings: snapshot.unlocked ? {
      autoAssignNew: snapshot.globalSettings && snapshot.globalSettings.autoAssignNew !== false,
      promptUnassigned: snapshot.globalSettings && snapshot.globalSettings.promptUnassigned !== false
    } : {}
  };
}

function redactResponseForContext(data, context) {
  if (context !== "content" || data == null) return data;
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "configured") && Object.prototype.hasOwnProperty.call(data, "unlocked")) return redactSnapshotForContent(data);
  if (data && typeof data === "object" && data.snapshot) return { ...data, snapshot: redactSnapshotForContent(data.snapshot) };
  return data;
}

async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text))));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getSupportUrl() {
  const decoded = C.base64UrlToUtf8(SUPPORT_LINK_B64_PARTS.join(""));
  const expected = SUPPORT_LINK_SHA256_PARTS.join("");
  if (await sha256Hex(decoded) !== expected) throw new Error("SUPPORT_LINK_INTEGRITY_FAILED");
  const url = new URL(decoded);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/sponsors/")) throw new Error("INVALID_SUPPORT_LINK");
  return url.href;
}

async function openSupport() {
  const url = await getSupportUrl();
  await chrome.tabs.create({ url });
  return { opened: true };
}

function cleanupSecureRequests(raw) {
  const now = Date.now();
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [nonce, request] of Object.entries(source)) {
    if (!request || typeof request !== "object") continue;
    if (now - Number(request.createdAt || 0) > 10 * 60 * 1000) continue;
    out[nonce] = request;
  }
  return out;
}

async function readSecureRequests() {
  const result = await chrome.storage.session.get(SECURE_REQUESTS_KEY);
  return cleanupSecureRequests(result[SECURE_REQUESTS_KEY]);
}

async function writeSecureRequests(requests) {
  await chrome.storage.session.set({ [SECURE_REQUESTS_KEY]: cleanupSecureRequests(requests) });
}

async function openSecureAuth(message, sender) {
  const mode = ["setup", "login", "assign", "sensitive"].includes(message.mode) ? message.mode : "login";
  const request = {
    nonce: C.createId("auth"),
    mode,
    createdAt: Date.now(),
    sourceTabId: sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : null,
    preselectedProfileId: C.isValidProfileId(message.profileId) ? message.profileId : null,
    entityType: message.entityType === "project" ? "project" : "conversation",
    entityId: null,
    conversationIds: [],
    projectIds: []
  };
  if (mode === "assign" || mode === "sensitive") {
    request.entityId = request.entityType === "project" ? C.normalizeProjectId(message.entityId) : C.normalizeConversationId(message.entityId);
    if (!request.entityId) throw new Error("INVALID_ENTITY");
  }
  if (mode === "setup") {
    request.conversationIds = (Array.isArray(message.conversationIds) ? message.conversationIds : []).map((id) => C.normalizeConversationId(id)).filter(Boolean).slice(0, 5000);
    request.projectIds = (Array.isArray(message.projectIds) ? message.projectIds : []).map((id) => C.normalizeProjectId(id)).filter(Boolean).slice(0, 1000);
  }
  if (mode === "assign" && request.entityType === "project") {
    request.conversationIds = (Array.isArray(message.conversationIds) ? message.conversationIds : []).map((id) => C.normalizeConversationId(id)).filter(Boolean).slice(0, 5000);
  }
  const requests = await readSecureRequests();
  requests[request.nonce] = request;
  await writeSecureRequests(requests);
  await chrome.tabs.create({ url: chrome.runtime.getURL(`secure-auth.html?nonce=${encodeURIComponent(request.nonce)}`), active: true });
  return { opened: true, nonce: request.nonce };
}

async function getSecureRequest(message) {
  const nonce = C.sanitizeText(message.nonce, 120);
  const requests = await readSecureRequests();
  const request = requests[nonce];
  if (!request) throw new Error("SECURE_REQUEST_EXPIRED");
  return request;
}

async function clearSecureRequest(message) {
  const nonce = C.sanitizeText(message.nonce, 120);
  const requests = await readSecureRequests();
  delete requests[nonce];
  await writeSecureRequests(requests);
  return { cleared: true };
}

async function closeSecureAuth(_message, sender) {
  if (sender && sender.tab && Number.isInteger(sender.tab.id)) await chrome.tabs.remove(sender.tab.id).catch(() => undefined);
  return { closed: true };
}

function serialized(task) {
  const pending = operationQueue.then(task, task);
  operationQueue = pending.catch(() => undefined);
  return pending;
}

async function readStored() {
  const result = await chrome.storage.local.get(C.STORAGE_KEY);
  return C.normalizeState(result[C.STORAGE_KEY]);
}

async function writeStored(state) {
  state.updatedAt = Date.now();
  await chrome.storage.local.set({ [C.STORAGE_KEY]: state });
}

async function readSession() {
  const result = await chrome.storage.session.get(C.SESSION_KEY);
  const raw = result[C.SESSION_KEY] || {};
  return {
    unlockedProfileId: C.isValidProfileId(raw.unlockedProfileId) ? raw.unlockedProfileId : null,
    vaultKey: typeof raw.vaultKey === "string" ? raw.vaultKey : null,
    failedAttempts: Number.isInteger(raw.failedAttempts) ? raw.failedAttempts : 0,
    blockedUntil: Number.isFinite(raw.blockedUntil) ? Number(raw.blockedUntil) : 0,
    authFailures: raw.authFailures && typeof raw.authFailures === "object" ? raw.authFailures : {},
    lastActivityAt: Number.isFinite(raw.lastActivityAt) ? Number(raw.lastActivityAt) : 0,
    authorizedEntities: raw.authorizedEntities && typeof raw.authorizedEntities === "object" ? raw.authorizedEntities : {},
    presentationMode: raw.presentationMode === true,
    screenshotMode: raw.screenshotMode === true,
    commandPaletteRequestedAt: Number.isFinite(raw.commandPaletteRequestedAt) ? raw.commandPaletteRequestedAt : 0,
    webauthnChallenge: typeof raw.webauthnChallenge === "string" ? raw.webauthnChallenge : null,
    webauthnProfileId: C.isValidProfileId(raw.webauthnProfileId) ? raw.webauthnProfileId : null,
    webauthnPurpose: ["register", "authenticate"].includes(raw.webauthnPurpose) ? raw.webauthnPurpose : null,
    webauthnIssuedAt: Number.isFinite(raw.webauthnIssuedAt) ? Number(raw.webauthnIssuedAt) : 0
  };
}

async function writeSession(session) {
  await chrome.storage.session.set({ [C.SESSION_KEY]: session });
}

function blankSession() {
  return {
    unlockedProfileId: null,
    vaultKey: null,
    failedAttempts: 0,
    blockedUntil: 0,
    authFailures: {},
    lastActivityAt: 0,
    authorizedEntities: {},
    presentationMode: false,
    screenshotMode: false,
    commandPaletteRequestedAt: 0,
    webauthnChallenge: null,
    webauthnProfileId: null,
    webauthnPurpose: null,
    webauthnIssuedAt: 0
  };
}

function webauthnOrigin() {
  return `chrome-extension://${chrome.runtime.id}`;
}

function randomWebauthnChallenge() {
  return C.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function clearWebauthnChallenge(session) {
  session.webauthnChallenge = null;
  session.webauthnProfileId = null;
  session.webauthnPurpose = null;
  session.webauthnIssuedAt = 0;
}

function decodeClientData(encoded) {
  try {
    return JSON.parse(new TextDecoder().decode(C.base64UrlToBytes(encoded)));
  } catch (_error) {
    throw new Error("INVALID_WEBAUTHN_CLIENT_DATA");
  }
}

function validateWebauthnClientData(session, profileId, purpose, encodedClientData) {
  if (!session.webauthnChallenge || session.webauthnProfileId !== profileId || session.webauthnPurpose !== purpose) {
    throw new Error("WEBAUTHN_CHALLENGE_MISSING");
  }
  if (!session.webauthnIssuedAt || Date.now() - session.webauthnIssuedAt > 120000) {
    throw new Error("WEBAUTHN_CHALLENGE_EXPIRED");
  }
  const client = decodeClientData(encodedClientData);
  const expectedType = purpose === "register" ? "webauthn.create" : "webauthn.get";
  if (client.type !== expectedType || client.challenge !== session.webauthnChallenge || client.origin !== webauthnOrigin()) {
    throw new Error("INVALID_WEBAUTHN_CLIENT_DATA");
  }
  return client;
}

function derEcdsaToRaw(signature, size = 32) {
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  if (bytes.length === size * 2) return bytes;
  if (bytes.length < 8 || bytes[0] !== 0x30) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  let offset = 1;
  let seqLen = bytes[offset++];
  if (seqLen & 0x80) {
    const count = seqLen & 0x7f; seqLen = 0;
    if (count < 1 || count > 2) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
    for (let i = 0; i < count; i += 1) seqLen = (seqLen << 8) | bytes[offset++];
  }
  if (bytes[offset++] !== 0x02) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  let rLen = bytes[offset++];
  const r = bytes.slice(offset, offset + rLen); offset += rLen;
  if (bytes[offset++] !== 0x02) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  let sLen = bytes[offset++];
  const sval = bytes.slice(offset, offset + sLen);
  const trim = (part) => {
    let start = 0;
    while (start < part.length - 1 && part[start] === 0) start += 1;
    const clean = part.slice(start);
    if (clean.length > size) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
    const out = new Uint8Array(size); out.set(clean, size - clean.length); return out;
  };
  const rr = trim(r), ss = trim(sval), out = new Uint8Array(size * 2);
  out.set(rr, 0); out.set(ss, size); return out;
}

async function verifyWebauthnAssertion(profile, session, assertion) {
  if (!profile.webauthn || !profile.webauthn.enabled) return true;
  if (!assertion || typeof assertion !== "object") throw new Error("WEBAUTHN_REQUIRED");
  validateWebauthnClientData(session, profile.id, "authenticate", assertion.clientDataJSON);
  if (C.sanitizeText(assertion.credentialId, 1024) !== profile.webauthn.credentialId) throw new Error("WEBAUTHN_CREDENTIAL_MISMATCH");
  const authenticatorData = C.base64UrlToBytes(assertion.authenticatorData);
  if (authenticatorData.length < 37) throw new Error("INVALID_WEBAUTHN_AUTHENTICATOR_DATA");
  const flags = authenticatorData[32];
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0) throw new Error("WEBAUTHN_USER_VERIFICATION_REQUIRED");
  const clientBytes = C.base64UrlToBytes(assertion.clientDataJSON);
  const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientBytes));
  const signed = new Uint8Array(authenticatorData.length + clientHash.length);
  signed.set(authenticatorData, 0); signed.set(clientHash, authenticatorData.length);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    C.base64ToBytes(profile.webauthn.publicKeySpki),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  let signature = C.base64UrlToBytes(assertion.signature);
  try { signature = derEcdsaToRaw(signature); } catch (_error) { /* Some authenticators/WebCrypto paths already use raw signatures. */ }
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, signed);
  if (!ok) throw new Error("WEBAUTHN_VERIFICATION_FAILED");
  return true;
}

async function beginWebauthn(message, purpose) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    const profileId = C.isValidProfileId(message.profileId) ? message.profileId : state.activeProfileId;
    const profile = state.profiles[profileId];
    if (!state.configured || !profile) throw new Error("INVALID_PROFILE");
    if (purpose === "register") {
      assertUnlocked(state, session);
      if (profileId !== state.activeProfileId) throw new Error("WEBAUTHN_ACTIVE_PROFILE_ONLY");
    } else if (!profile.webauthn || !profile.webauthn.enabled) {
      throw new Error("WEBAUTHN_NOT_ENABLED");
    }
    session.webauthnChallenge = randomWebauthnChallenge();
    session.webauthnProfileId = profileId;
    session.webauthnPurpose = purpose;
    session.webauthnIssuedAt = Date.now();
    await writeSession(session);
    return {
      challenge: session.webauthnChallenge,
      profileId,
      profileName: profile.name,
      credentialId: profile.webauthn && profile.webauthn.credentialId ? profile.webauthn.credentialId : null,
      rpName: "DuoChat",
      userId: C.bytesToBase64Url(new TextEncoder().encode(profileId).slice(0, 64))
    };
  });
}

async function finishWebauthnRegistration(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    const profileId = state.activeProfileId;
    const profile = state.profiles[profileId];
    validateWebauthnClientData(session, profileId, "register", message.clientDataJSON);
    const credentialId = C.sanitizeText(message.credentialId, 1024);
    const publicKeySpki = C.sanitizeText(message.publicKeySpki, 4096);
    if (!credentialId || !publicKeySpki || Number(message.algorithm) !== -7) throw new Error("UNSUPPORTED_WEBAUTHN_CREDENTIAL");
    const publicKeyBytes = C.base64ToBytes(publicKeySpki);
    if (publicKeyBytes.length < 64) throw new Error("INVALID_WEBAUTHN_PUBLIC_KEY");
    profile.webauthn = { enabled: true, credentialId, publicKeySpki, algorithm: -7, createdAt: Date.now() };
    clearWebauthnChallenge(session);
    const vault = await loadVault(state, session);
    vault.securityLog = C.addLog(vault.securityLog, { profileId, action: "webauthn_enabled", detail: "Platform authenticator / security key" });
    await persistVault(state, session, vault, "enable WebAuthn");
    await writeSession(session);
    await broadcast();
    return publicSnapshot(state, session, vault);
  });
}

async function disableWebauthn() {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    const profileId = state.activeProfileId;
    const profile = state.profiles[profileId];
    profile.webauthn = null;
    const vault = await loadVault(state, session);
    vault.securityLog = C.addLog(vault.securityLog, { profileId, action: "webauthn_disabled" });
    await persistVault(state, session, vault, "disable WebAuthn");
    await broadcast();
    return publicSnapshot(state, session, vault);
  });
}

function sessionVaultKey(session) {
  if (!session || !session.vaultKey) return null;
  try {
    const bytes = C.base64ToBytes(session.vaultKey);
    return bytes.length === 32 ? bytes : null;
  } catch (_error) {
    return null;
  }
}

async function loadVault(state, session) {
  if (!state.configured) return C.createEmptyVault();
  if (!state.encryption.enabled) return C.normalizeVault(state.legacyVault, state.profiles);
  const key = sessionVaultKey(session);
  if (!key) throw new Error("LOCKED");
  const decrypted = await C.decryptJsonWithRawKey(state.encryption.encryptedVault, key);
  return C.normalizeVault(decrypted, state.profiles);
}

async function persistVault(state, session, vault, backupLabel = null) {
  if (backupLabel && (!vault.globalSettings || vault.globalSettings.localBackups !== false)) {
    await createBackup(state, backupLabel, vault.globalSettings && vault.globalSettings.backupLimit);
  }
  if (state.encryption.enabled) {
    const key = sessionVaultKey(session);
    if (!key) throw new Error("LOCKED");
    state.encryption.encryptedVault = await C.encryptJsonWithRawKey(C.normalizeVault(vault, state.profiles), key);
    state.legacyVault = null;
  } else {
    state.legacyVault = C.normalizeVault(vault, state.profiles);
  }
  await writeStored(state);
}

async function createBackup(state, label = "automatic", requestedLimit = null) {
  try {
    const result = await chrome.storage.local.get(C.BACKUPS_KEY);
    const backups = Array.isArray(result[C.BACKUPS_KEY]) ? result[C.BACKUPS_KEY] : [];
    const configuredLimit = Math.max(1, Math.min(C.MAX_BACKUPS, Number(requestedLimit) || C.MAX_BACKUPS));
    const limit = state.encryption.enabled ? configuredLimit : Math.min(8, configuredLimit);
    backups.push({ id: C.createId("backup"), ts: Date.now(), label: C.sanitizeText(label, 80), state });
    await chrome.storage.local.set({ [C.BACKUPS_KEY]: backups.slice(-limit) });
  } catch (_error) {
    // Backups are best-effort and must never break protection.
  }
}

async function broadcast(message = { type: "DUOCHAT_REFRESH" }) {
  const groups = await Promise.all([
    chrome.tabs.query({ url: "https://chatgpt.com/*" }),
    chrome.tabs.query({ url: "https://claude.ai/*" })
  ]);
  const tabs = [...new Map(groups.flat().map((tab) => [tab.id, tab])).values()];
  await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, message)));
}

function profileVisibleWhenLocked(profile, state) {
  if (!profile) return false;
  if (profile.decoy) return true;
  if (profile.stealth) return false;
  return true;
}

function compactMetaForProfile(vault, profileId) {
  const conversations = {};
  for (const [id, owner] of Object.entries(vault.conversationOwners)) {
    if (owner !== profileId) continue;
    const meta = vault.conversationMeta[id] || {};
    conversations[id] = {
      title: meta.title || "",
      alias: meta.alias || "",
      favorite: meta.favorite === true,
      hidden: meta.hidden === true,
      extraLock: meta.extraLock === true,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      folder: meta.folder || "",
      projectId: meta.projectId || null,
      lastSeenAt: meta.lastSeenAt || null,
      url: meta.url || ""
    };
  }
  const projects = {};
  for (const [id, owner] of Object.entries(vault.projectOwners)) {
    if (owner !== profileId) continue;
    const meta = vault.projectMeta[id] || {};
    projects[id] = {
      title: meta.title || "",
      alias: meta.alias || "",
      favorite: meta.favorite === true,
      hidden: meta.hidden === true,
      extraLock: meta.extraLock === true,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      folder: meta.folder || "",
      lastSeenAt: meta.lastSeenAt || null,
      url: meta.url || ""
    };
  }
  return { conversations, projects };
}

function publicSnapshot(state, session, vault = null) {
  const unlocked = Boolean(
    state.configured &&
    session.unlockedProfileId &&
    session.unlockedProfileId === state.activeProfileId &&
    (!state.encryption.enabled || session.vaultKey)
  );
  const profiles = {};
  for (const id of state.profileOrder) {
    const profile = state.profiles[id];
    if (!profile) continue;
    if (!unlocked && !profileVisibleWhenLocked(profile, state)) continue;
    profiles[id] = C.profilePublic(profile, !unlocked);
  }
  const profileOrder = state.profileOrder.filter((id) => Boolean(profiles[id]));
  const activeSettings = unlocked && vault ? vault.profileSettings[state.activeProfileId] : null;
  const meta = unlocked && vault ? compactMetaForProfile(vault, state.activeProfileId) : { conversations: {}, projects: {} };
  const authorizedSensitiveIds = [];
  if (unlocked) {
    const now = Date.now();
    for (const [id, expiry] of Object.entries(session.authorizedEntities || {})) {
      if (Number(expiry) > now) authorizedSensitiveIds.push(id);
    }
  }
  return {
    version: state.version,
    configured: state.configured,
    encrypted: state.encryption.enabled,
    migrationNeedsEncryption: state.configured && !state.encryption.enabled,
    activeProfileId: state.activeProfileId,
    profiles,
    profileOrder,
    unlocked,
    conversationOwners: unlocked && vault ? vault.conversationOwners : {},
    projectOwners: unlocked && vault ? vault.projectOwners : {},
    conversationMeta: meta.conversations,
    projectMeta: meta.projects,
    activeSettings,
    rules: unlocked && vault ? vault.rules : [],
    globalSettings: unlocked && vault ? vault.globalSettings : {},
    presentationMode: unlocked && session.presentationMode,
    screenshotMode: unlocked && session.screenshotMode,
    authorizedSensitiveIds
  };
}

async function getSnapshot() {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  let vault = null;
  const unlocked = state.configured && session.unlockedProfileId === state.activeProfileId;
  if (unlocked) {
    try { vault = await loadVault(state, session); } catch (_error) { vault = null; }
  }
  return publicSnapshot(state, session, vault);
}

async function getLanguage() {
  const result = await chrome.storage.local.get(C.LANGUAGE_KEY);
  return { language: I.normalizeLanguage(result[C.LANGUAGE_KEY]) };
}

async function setLanguage(message) {
  const language = I.normalizeLanguage(message.language);
  if (!language) throw new Error("INVALID_LANGUAGE");
  await chrome.storage.local.set({ [C.LANGUAGE_KEY]: language });
  await broadcast();
  return { language };
}

function defaultProfileSettingsFor(profile) {
  return C.normalizeVault({ profileSettings: {} }, { [profile.id]: profile }).profileSettings[profile.id];
}

function validateSetupProfiles(rawProfiles) {
  if (!Array.isArray(rawProfiles) || rawProfiles.length < 2 || rawProfiles.length > 12) throw new Error("INVALID_PROFILE_COUNT");
  const seenNames = new Set();
  return rawProfiles.map((raw, index) => {
    if (!C.isValidPassword(raw.password)) throw new Error("PASSWORD_TOO_SHORT");
    const name = C.sanitizeName(raw.name, `Utilisateur ${index + 1}`);
    const key = name.toLocaleLowerCase();
    if (seenNames.has(key)) throw new Error("PROFILE_NAME_ALREADY_EXISTS");
    seenNames.add(key);
    return {
      name,
      password: raw.password,
      template: C.PROFILE_TEMPLATES[raw.template] ? raw.template : (index === 0 ? "personal" : "personal"),
      avatar: C.sanitizeText(raw.avatar, 4),
      accent: C.sanitizeColor(raw.accent, ["#7667F5", "#22A06B", "#D97706", "#E5484D", "#2563EB", "#9333EA"][index % 6]),
      temporary: C.normalizeTemporary(raw.temporary)
    };
  });
}

async function configureAdvanced(message) {
  return serialized(async () => {
    const current = await readStored();
    if (current.configured) throw new Error("ALREADY_CONFIGURED");
    const setupProfiles = validateSetupProfiles(message.profiles);
    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    const profiles = {};
    const order = [];
    for (let index = 0; index < setupProfiles.length; index += 1) {
      const input = setupProfiles[index];
      const id = index < 2 ? (index === 0 ? "A" : "B") : C.createProfileId(profiles);
      const [credential, vaultWrap] = await Promise.all([
        C.createCredential(input.password),
        C.wrapVaultKey(vaultKey, input.password)
      ]);
      profiles[id] = C.normalizeProfileHeader(id, {
        id,
        name: input.name,
        credential,
        vaultWrap,
        role: index === 0 ? "admin" : (C.PROFILE_TEMPLATES[input.template].role || "member"),
        template: input.template,
        avatar: input.avatar,
        accent: input.accent,
        temporary: input.temporary,
        createdAt: Date.now()
      }, index);
      order.push(id);
    }
    const requestedIndex = Number.isInteger(Number(message.firstProfileIndex)) ? Math.max(0, Math.min(order.length - 1, Number(message.firstProfileIndex))) : 0;
    const activeProfileId = C.isValidProfileId(message.firstProfileId) && profiles[message.firstProfileId]
      ? message.firstProfileId
      : (order[requestedIndex] || order[0]);
    const vault = C.createEmptyVault();
    for (const id of order) vault.profileSettings[id] = defaultProfileSettingsFor(profiles[id]);
    if (message.ruleDefaults && typeof message.ruleDefaults === "object") {
      vault.globalSettings.autoAssignNew = message.ruleDefaults.autoAssignNew !== false;
      vault.globalSettings.promptUnassigned = message.ruleDefaults.promptUnassigned !== false;
    }
    for (const rawId of Array.isArray(message.conversationIds) ? message.conversationIds : []) {
      const id = C.normalizeConversationId(rawId);
      if (id) vault.conversationOwners[id] = activeProfileId;
    }
    for (const rawId of Array.isArray(message.projectIds) ? message.projectIds : []) {
      const id = C.normalizeProjectId(rawId);
      if (id) vault.projectOwners[id] = activeProfileId;
    }
    const recoveryKey = C.generateRecoveryKey();
    const recoveryWrap = await C.wrapVaultKey(vaultKey, recoveryKey);
    const state = {
      version: C.STATE_VERSION,
      configured: true,
      activeProfileId,
      profiles,
      profileOrder: order,
      encryption: {
        enabled: true,
        encryptedVault: await C.encryptJsonWithRawKey(vault, vaultKey),
        recoveryWrap
      },
      legacyVault: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const session = blankSession();
    session.unlockedProfileId = activeProfileId;
    session.vaultKey = C.bytesToBase64(vaultKey);
    session.lastActivityAt = Date.now();
    await Promise.all([writeStored(state), writeSession(session)]);
    await broadcast();
    return { snapshot: publicSnapshot(state, session, vault), recoveryKey };
  });
}

async function configureLegacyMessage(message) {
  return configureAdvanced({
    profiles: [
      { name: message.nameA, password: message.passwordA, template: "personal" },
      { name: message.nameB, password: message.passwordB, template: "personal" }
    ],
    firstProfileId: message.firstProfileId,
    conversationIds: message.conversationIds,
    projectIds: message.projectIds,
    ruleDefaults: { autoAssignNew: true, promptUnassigned: true }
  });
}

async function unlock(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    const profileId = message.profileId;
    const profile = state.profiles[profileId];
    if (!state.configured || !profile) throw new Error("INVALID_PROFILE");
    const now = Date.now();
    const temporary = profile.temporary;
    if (temporary && (temporary.expired === true || (temporary.mode === "hours" && temporary.expiresAt && temporary.expiresAt <= now))) {
      throw new Error("PROFILE_EXPIRED");
    }
    if (!C.isScheduleAllowed(profile.schedule, new Date())) throw new Error("PROFILE_OUTSIDE_SCHEDULE");
    const authFailures = session.authFailures && typeof session.authFailures === "object" ? session.authFailures : {};
    const authState = authFailures[profileId] && typeof authFailures[profileId] === "object" ? authFailures[profileId] : { count: 0, blockedUntil: 0 };
    if (Number(authState.blockedUntil || 0) > now) throw new Error(`TEMPORARILY_BLOCKED:${Math.max(1, Math.ceil((authState.blockedUntil - now) / 1000))}`);
    const verified = await C.verifyCredential(message.password, profile.credential);
    if (!verified) {
      const count = Math.min(50, Number(authState.count || 0) + 1);
      let delayMs = 0;
      if (count >= 15) delayMs = 30 * 60 * 1000;
      else if (count >= 10) delayMs = 5 * 60 * 1000;
      else if (count >= 5) delayMs = 30 * 1000;
      const next = { ...session, vaultKey: null, unlockedProfileId: null, authorizedEntities: {}, presentationMode: false, screenshotMode: false };
      next.authFailures = { ...authFailures, [profileId]: { count, blockedUntil: delayMs ? now + delayMs : 0 } };
      await writeSession(next);
      throw new Error(delayMs ? `TEMPORARILY_BLOCKED:${Math.ceil(delayMs / 1000)}` : "WRONG_PASSWORD");
    }
    session.authFailures = { ...authFailures, [profileId]: { count: 0, blockedUntil: 0 } };

    if (profile.webauthn && profile.webauthn.enabled) {
      await verifyWebauthnAssertion(profile, session, message.webauthnAssertion);
      clearWebauthnChallenge(session);
    }

    let vaultKey = null;
    let vault = null;
    if (state.encryption.enabled) {
      if (!profile.vaultWrap) throw new Error("PROFILE_ENCRYPTION_NOT_ENROLLED");
      vaultKey = await C.unwrapVaultKey(profile.vaultWrap, message.password);
      const tempSession = { ...session, vaultKey: C.bytesToBase64(vaultKey) };
      vault = await loadVault(state, tempSession);
    } else {
      vault = await loadVault(state, session);
    }
    // Remove expired guest profiles now that the encrypted vault is available.
    for (const targetId of [...state.profileOrder]) {
      if (targetId === profileId) continue;
      const target = state.profiles[targetId];
      const temp = target && target.temporary;
      const expired = temp && (temp.expired === true || (temp.mode === "hours" && temp.expiresAt && temp.expiresAt <= now));
      if (!expired) continue;
      delete state.profiles[targetId];
      state.profileOrder = state.profileOrder.filter((id) => id !== targetId);
      delete vault.profileSettings[targetId];
      for (const [id, owner] of Object.entries(vault.conversationOwners)) if (owner === targetId) delete vault.conversationOwners[id];
      for (const [id, owner] of Object.entries(vault.projectOwners)) if (owner === targetId) delete vault.projectOwners[id];
      vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "temporary_profile_deleted", detail: targetId });
    }
    state.activeProfileId = profileId;
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "profile_unlock" });
    const next = blankSession();
    next.authFailures = session.authFailures || {};
    next.unlockedProfileId = profileId;
    next.vaultKey = vaultKey ? C.bytesToBase64(vaultKey) : null;
    next.lastActivityAt = now;
    if (state.encryption.enabled) await persistVault(state, next, vault);
    else {
      state.legacyVault = vault;
      await writeStored(state);
    }
    await writeSession(next);
    await broadcast();
    return publicSnapshot(state, next, vault);
  });
}

async function recoveryUnlock(message) {
  return serialized(async () => {
    const state = await readStored();
    if (!state.configured || !state.encryption.enabled || !state.encryption.recoveryWrap) throw new Error("RECOVERY_UNAVAILABLE");
    let vaultKey;
    try { vaultKey = await C.unwrapVaultKey(state.encryption.recoveryWrap, message.recoveryKey); }
    catch (_error) { throw new Error("WRONG_RECOVERY_KEY"); }
    const session = blankSession();
    const preferred = state.profileOrder.find((id) => state.profiles[id] && state.profiles[id].role === "admin") || state.activeProfileId || state.profileOrder[0];
    state.activeProfileId = preferred;
    session.unlockedProfileId = preferred;
    session.vaultKey = C.bytesToBase64(vaultKey);
    session.lastActivityAt = Date.now();
    const vault = await loadVault(state, session);
    vault.securityLog = C.addLog(vault.securityLog, { profileId: preferred, action: "recovery_unlock", detail: "Recovery key used" });
    await persistVault(state, session, vault);
    await writeSession(session);
    await broadcast();
    return publicSnapshot(state, session, vault);
  });
}

async function lock(reason = "manual", panic = false) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    if (state.configured && session.unlockedProfileId) {
      try {
        const vault = await loadVault(state, session);
        vault.securityLog = C.addLog(vault.securityLog, { profileId: session.unlockedProfileId, action: panic ? "panic_lock" : "profile_lock", detail: reason });
        await persistVault(state, session, vault);
      } catch (_error) { /* ignore logging failure */ }
    }
    const next = blankSession();
    await writeSession(next);
    await broadcast(panic ? { type: "DUOCHAT_PANIC" } : { type: "DUOCHAT_REFRESH" });
    return publicSnapshot(state, next, null);
  });
}

function assertUnlocked(state, session) {
  if (!state.configured || session.unlockedProfileId !== state.activeProfileId) throw new Error("LOCKED");
}

function hasPermission(vault, profileId, permission) {
  const settings = vault.profileSettings[profileId] || {};
  const profilePermissions = Array.isArray(settings.permissions) ? settings.permissions : [];
  return profilePermissions.includes("admin") || profilePermissions.includes(permission);
}

function requirePermission(vault, profileId, permission) {
  if (!hasPermission(vault, profileId, permission)) throw new Error("PERMISSION_DENIED");
}

async function withUnlockedMutation(label, handler) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    const vault = await loadVault(state, session);
    const data = await handler({ state, session, vault, profileId: state.activeProfileId });
    await persistVault(state, session, vault, label);
    await broadcast();
    return data === undefined ? publicSnapshot(state, session, vault) : data;
  });
}

function resolveRuleOwner(vault, state, context = {}) {
  const rules = [...vault.rules].filter((rule) => rule.enabled).sort((a, b) => b.priority - a.priority);
  for (const rule of rules) {
    if (!state.profiles[rule.profileId]) continue;
    if (rule.type === "project" && context.projectId && C.normalizeProjectId(context.projectId) === rule.projectId) return rule.profileId;
    if (rule.type === "site" && context.siteId === rule.siteId) return rule.profileId;
    if (rule.type === "title_contains" && rule.contains && String(context.title || "").toLowerCase().includes(rule.contains)) return rule.profileId;
    if (rule.type === "default_new") return rule.profileId;
  }
  return state.activeProfileId;
}

async function claimConversations(message) {
  return withUnlockedMutation("assign conversations", async ({ state, vault, profileId }) => {
    requirePermission(vault, profileId, "move_chats");
    const ids = Array.isArray(message.conversationIds) ? message.conversationIds : [message.conversationId];
    for (const rawId of ids.slice(0, 5000)) {
      const id = C.normalizeConversationId(rawId);
      if (!id) continue;
      const existing = vault.conversationOwners[id];
      if (existing && existing !== profileId) throw new Error("CONVERSATION_BELONGS_TO_OTHER_PROFILE");
      vault.conversationOwners[id] = profileId;
      const meta = vault.conversationMeta[id] || {};
      vault.conversationMeta[id] = { ...meta, projectId: C.normalizeProjectId(message.projectId || meta.projectId || ""), updatedAt: Date.now() };
    }
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "claim_conversation", detail: `${ids.length} item(s)` });
  });
}

async function claimProjects(message) {
  return withUnlockedMutation("assign projects", async ({ vault, profileId }) => {
    requirePermission(vault, profileId, "create_projects");
    const ids = Array.isArray(message.projectIds) ? message.projectIds : [message.projectId];
    for (const rawId of ids.slice(0, 1000)) {
      const id = C.normalizeProjectId(rawId);
      if (!id) continue;
      const existing = vault.projectOwners[id];
      if (existing && existing !== profileId) throw new Error("PROJECT_BELONGS_TO_OTHER_PROFILE");
      vault.projectOwners[id] = profileId;
    }
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "claim_project", detail: `${ids.length} item(s)` });
  });
}

async function claimProjectAndConversations(message) {
  return withUnlockedMutation("assign project and chats", async ({ vault, profileId }) => {
    requirePermission(vault, profileId, "create_projects");
    requirePermission(vault, profileId, "move_chats");
    const projectId = C.normalizeProjectId(message.projectId);
    if (!projectId) throw new Error("INVALID_PROJECT");
    const existing = vault.projectOwners[projectId];
    if (existing && existing !== profileId) throw new Error("PROJECT_BELONGS_TO_OTHER_PROFILE");
    vault.projectOwners[projectId] = profileId;
    for (const rawId of (Array.isArray(message.conversationIds) ? message.conversationIds : []).slice(0, 5000)) {
      const id = C.normalizeConversationId(rawId);
      if (!id) continue;
      const owner = vault.conversationOwners[id];
      // Never steal an already assigned conversation.
      if (owner && owner !== profileId) continue;
      vault.conversationOwners[id] = profileId;
      vault.conversationMeta[id] = { ...(vault.conversationMeta[id] || {}), projectId, updatedAt: Date.now() };
    }
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "claim_project_tree", entityType: "project", entityId: projectId });
  });
}

async function autoAssign(message) {
  return withUnlockedMutation("auto assignment", async ({ state, vault, profileId }) => {
    if (vault.globalSettings.autoAssignNew === false) return publicSnapshot(state, await readSession(), vault);
    const kind = message.entityType === "project" ? "project" : "conversation";
    const id = kind === "project" ? C.normalizeProjectId(message.entityId) : C.normalizeConversationId(message.entityId);
    if (!id) throw new Error("INVALID_ENTITY");
    const owners = kind === "project" ? vault.projectOwners : vault.conversationOwners;
    if (owners[id]) return publicSnapshot(state, await readSession(), vault);
    const targetId = resolveRuleOwner(vault, state, {
      projectId: message.projectId,
      siteId: message.siteId,
      title: message.title
    });
    if (!state.profiles[targetId]) throw new Error("INVALID_PROFILE");
    owners[id] = targetId;
    const metaMap = kind === "project" ? vault.projectMeta : vault.conversationMeta;
    metaMap[id] = {
      ...(metaMap[id] || {}),
      title: C.sanitizeText(message.title, 160),
      url: C.sanitizeEntityUrl(message.url, kind, id),
      projectId: kind === "conversation" ? C.normalizeProjectId(message.projectId || "") : null,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      updatedAt: Date.now()
    };
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "auto_assign", entityType: kind, entityId: id, detail: `to ${targetId}` });
    return null;
  });
}

async function recordUnassignedEntity(message) {
  return withUnlockedMutation("record unassigned entity", async ({ vault, profileId }) => {
    const kind = message.entityType === "project" ? "project" : "conversation";
    const id = kind === "project" ? C.normalizeProjectId(message.entityId) : C.normalizeConversationId(message.entityId);
    if (!id) throw new Error("INVALID_ENTITY");
    const owners = kind === "project" ? vault.projectOwners : vault.conversationOwners;
    if (owners[id]) return null;
    const map = kind === "project" ? vault.projectMeta : vault.conversationMeta;
    const current = map[id] || {};
    map[id] = {
      ...current,
      title: C.sanitizeText(message.title || current.title, 160),
      url: C.sanitizeEntityUrl(message.url || current.url, kind, id),
      projectId: kind === "conversation" ? C.normalizeProjectId(message.projectId || current.projectId || "") : null,
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
      createdAt: current.createdAt || Date.now()
    };
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "unassigned_detected", entityType: kind, entityId: id });
    return null;
  });
}

function migrationScoreForProfile(state, vault, profileId, kind, id, meta) {
  const profile = state.profiles[profileId];
  if (!profile) return { score: -1, reasons: [] };
  let score = 0;
  const reasons = [];
  const title = `${meta.title || ""} ${meta.alias || ""} ${meta.folder || ""} ${(meta.tags || []).join(" ")}`.toLocaleLowerCase();
  const name = String(profile.name || "").toLocaleLowerCase();
  if (name.length >= 3 && title.includes(name)) { score += 75; reasons.push("profile-name"); }
  if (kind === "conversation" && meta.projectId && vault.projectOwners[meta.projectId] === profileId) { score += 120; reasons.push("project-owner"); }
  const siteId = String(id).split(":", 1)[0];
  for (const rule of vault.rules || []) {
    if (!rule.enabled || rule.profileId !== profileId) continue;
    let match = false;
    if (rule.type === "project" && meta.projectId && rule.projectId === meta.projectId) match = true;
    if (rule.type === "site" && rule.siteId === siteId) match = true;
    if (rule.type === "title_contains" && rule.contains && title.includes(rule.contains)) match = true;
    if (match) { score += 95 + Math.max(0, Number(rule.priority) || 0) / 10; reasons.push(`rule:${rule.type}`); }
  }
  const keywordSets = {
    work: ["travail","work","client","meeting","réunion","projet pro","business","invoice","facture","job","emploi"],
    study: ["étude","study","cours","devoir","examen","bac","but","université","school","homework","révision"],
    development: ["code","github","api","javascript","python","bug","repo","développement","dev","chrome extension","supabase"],
    personal: ["perso","personnel","famille","vacances","maison","loisir","voyage","sport"]
  };
  const keywords = keywordSets[profile.template] || [];
  const keywordHits = keywords.filter((word) => title.includes(word)).length;
  if (keywordHits) { score += Math.min(60, keywordHits * 20); reasons.push(`template:${profile.template}`); }
  if (profileId === state.activeProfileId) { score += 5; reasons.push("active-profile"); }
  return { score: Math.round(score), reasons };
}

async function smartMigration(message) {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  assertUnlocked(state, session);
  const vault = await loadVault(state, session);
  const profileId = state.activeProfileId;
  if (!hasPermission(vault, profileId, "admin") && !hasPermission(vault, profileId, "bulk_assign")) throw new Error("PERMISSION_DENIED");
  const suggestions = [];
  const collect = (kind, metaMap, ownerMap) => {
    for (const [id, meta] of Object.entries(metaMap || {})) {
      if (ownerMap[id]) continue;
      let best = null;
      for (const candidateId of state.profileOrder) {
        const scored = migrationScoreForProfile(state, vault, candidateId, kind, id, meta || {});
        if (!best || scored.score > best.score) best = { profileId: candidateId, ...scored };
      }
      if (best && best.score >= 20) suggestions.push({ entityType: kind, entityId: id, title: C.sanitizeText((meta && (meta.alias || meta.title)) || id, 160), suggestedProfileId: best.profileId, score: best.score, reasons: best.reasons });
    }
  };
  collect("conversation", vault.conversationMeta, vault.conversationOwners);
  collect("project", vault.projectMeta, vault.projectOwners);
  suggestions.sort((a, b) => b.score - a.score);
  return { suggestions: suggestions.slice(0, 500) };
}

async function applySmartMigration(message) {
  return withUnlockedMutation("smart migration", async ({ state, vault, profileId }) => {
    requirePermission(vault, profileId, "bulk_assign");
    let applied = 0;
    for (const item of Array.isArray(message.items) ? message.items.slice(0, 500) : []) {
      const targetId = item.profileId || item.suggestedProfileId;
      if (!state.profiles[targetId]) continue;
      const kind = item.entityType === "project" ? "project" : "conversation";
      const id = kind === "project" ? C.normalizeProjectId(item.entityId) : C.normalizeConversationId(item.entityId);
      if (!id) continue;
      const owners = kind === "project" ? vault.projectOwners : vault.conversationOwners;
      if (owners[id]) continue;
      owners[id] = targetId;
      applied += 1;
    }
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "smart_migration_applied", detail: String(applied) });
    return { applied };
  });
}

async function upsertEntityMeta(message) {
  return withUnlockedMutation("update metadata", async ({ vault, profileId }) => {
    requirePermission(vault, profileId, "manage_own_metadata");
    const kind = message.entityType === "project" ? "project" : "conversation";
    const id = kind === "project" ? C.normalizeProjectId(message.entityId) : C.normalizeConversationId(message.entityId);
    if (!id) throw new Error("INVALID_ENTITY");
    const owners = kind === "project" ? vault.projectOwners : vault.conversationOwners;
    if (owners[id] !== profileId) throw new Error("PERMISSION_DENIED");
    const map = kind === "project" ? vault.projectMeta : vault.conversationMeta;
    const current = map[id] || {};
    const patch = message.patch && typeof message.patch === "object" ? message.patch : {};
    map[id] = {
      ...current,
      title: patch.title === undefined ? current.title : C.sanitizeText(patch.title, 160),
      alias: patch.alias === undefined ? current.alias : C.sanitizeText(patch.alias, 160),
      note: patch.note === undefined ? current.note : C.sanitizeText(patch.note, 4000),
      folder: patch.folder === undefined ? current.folder : C.sanitizeText(patch.folder, 80),
      favorite: patch.favorite === undefined ? current.favorite === true : patch.favorite === true,
      hidden: patch.hidden === undefined ? current.hidden === true : patch.hidden === true,
      extraLock: patch.extraLock === undefined ? current.extraLock === true : patch.extraLock === true,
      tags: patch.tags === undefined ? (current.tags || []) : [...new Set((Array.isArray(patch.tags) ? patch.tags : []).map(C.sanitizeTag).filter(Boolean))].slice(0, 20),
      projectId: kind === "conversation" ? (patch.projectId === undefined ? current.projectId : C.normalizeProjectId(patch.projectId || "")) : null,
      url: patch.url === undefined ? current.url : C.sanitizeEntityUrl(patch.url, kind, id),
      lastSeenAt: patch.lastSeenAt === undefined ? (current.lastSeenAt || Date.now()) : Number(patch.lastSeenAt) || Date.now(),
      updatedAt: Date.now()
    };
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "metadata_update", entityType: kind, entityId: id });
  });
}

async function setEntityLock(message) {
  return withUnlockedMutation("sensitive entity lock", async ({ vault, profileId }) => {
    requirePermission(vault, profileId, "manage_own_metadata");
    const entityId = C.normalizeConversationId(message.entityId) || C.normalizeProjectId(message.entityId);
    if (!entityId) throw new Error("INVALID_ENTITY");
    const isConversation = Boolean(C.normalizeConversationId(entityId));
    const owners = isConversation ? vault.conversationOwners : vault.projectOwners;
    const map = isConversation ? vault.conversationMeta : vault.projectMeta;
    if (owners[entityId] !== profileId) throw new Error("PERMISSION_DENIED");
    const current = map[entityId] || {};
    if (message.enabled === true) {
      if (!C.isValidPassword(message.pin)) throw new Error("PASSWORD_TOO_SHORT");
      map[entityId] = { ...current, extraLock: true, extraLockCredential: await C.createCredential(message.pin), updatedAt: Date.now() };
      vault.securityLog = C.addLog(vault.securityLog, { profileId, action: "sensitive_lock_enabled", entityId });
    } else {
      map[entityId] = { ...current, extraLock: false, extraLockCredential: null, updatedAt: Date.now() };
      vault.securityLog = C.addLog(vault.securityLog, { profileId, action: "sensitive_lock_disabled", entityId });
    }
  });
}

async function authorizeEntity(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    const entityId = C.normalizeConversationId(message.entityId) || C.normalizeProjectId(message.entityId);
    if (!entityId) throw new Error("INVALID_ENTITY");
    const vault = await loadVault(state, session);
    const isConversation = Boolean(C.normalizeConversationId(entityId));
    const owners = isConversation ? vault.conversationOwners : vault.projectOwners;
    const map = isConversation ? vault.conversationMeta : vault.projectMeta;
    if (owners[entityId] !== state.activeProfileId) throw new Error("PERMISSION_DENIED");
    const profile = state.profiles[state.activeProfileId];
    const meta = map[entityId] || {};
    const credential = meta.extraLockCredential || profile.credential; // legacy extra locks fall back to the profile password
    if (!(await C.verifyCredential(message.password, credential))) {
      vault.securityLog = C.addLog(vault.securityLog, { profileId: state.activeProfileId, action: "sensitive_access_denied", entityId });
      await persistVault(state, session, vault);
      throw new Error("WRONG_PASSWORD");
    }
    session.authorizedEntities[entityId] = Date.now() + 10 * 60 * 1000;
    session.lastActivityAt = Date.now();
    vault.securityLog = C.addLog(vault.securityLog, { profileId: state.activeProfileId, action: "sensitive_access_granted", entityId });
    await persistVault(state, session, vault);
    await writeSession(session);
    await broadcast();
    return publicSnapshot(state, session, vault);
  });
}

async function recordSecurity(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    if (!state.configured || session.unlockedProfileId !== state.activeProfileId) return { ok: true };
    const vault = await loadVault(state, session);
    vault.securityLog = C.addLog(vault.securityLog, {
      profileId: state.activeProfileId,
      action: C.sanitizeText(message.action || "access_attempt", 80),
      entityType: C.sanitizeText(message.entityType, 40),
      entityId: C.sanitizeText(message.entityId, 220),
      detail: C.sanitizeText(message.detail, 240)
    });
    await persistVault(state, session, vault);
    return { ok: true };
  });
}

async function addProfile(message) {
  return withUnlockedMutation("add profile", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "manage_profiles");
    if (!C.isValidPassword(message.password)) throw new Error("PASSWORD_TOO_SHORT");
    const name = C.sanitizeName(message.name, `Utilisateur ${state.profileOrder.length + 1}`);
    if (state.profileOrder.some((id) => state.profiles[id].name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
      throw new Error("PROFILE_NAME_ALREADY_EXISTS");
    }
    const id = C.createProfileId(state.profiles);
    const key = sessionVaultKey(session);
    if (state.encryption.enabled && !key) throw new Error("LOCKED");
    const profile = C.normalizeProfileHeader(id, {
      id,
      name,
      credential: await C.createCredential(message.password),
      vaultWrap: state.encryption.enabled ? await C.wrapVaultKey(key, message.password) : null,
      role: message.role === "admin" ? "admin" : undefined,
      template: message.template,
      avatar: message.avatar,
      accent: message.accent,
      temporary: message.temporary,
      createdAt: Date.now()
    }, state.profileOrder.length);
    state.profiles[id] = profile;
    state.profileOrder.push(id);
    vault.profileSettings[id] = defaultProfileSettingsFor(profile);
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "profile_created", detail: id });
    return publicSnapshot(state, session, vault);
  });
}

async function updateProfile(message) {
  return withUnlockedMutation("update profile", async ({ state, session, vault, profileId }) => {
    const targetId = message.profileId || profileId;
    if (!state.profiles[targetId]) throw new Error("INVALID_PROFILE");
    const isSelf = targetId === profileId;
    if (isSelf) requirePermission(vault, profileId, "access_settings");
    else requirePermission(vault, profileId, "manage_profiles");
    const current = state.profiles[targetId];
    const patch = message.patch && typeof message.patch === "object" ? message.patch : {};
    if (patch.name !== undefined) current.name = C.sanitizeName(patch.name, current.name);
    if (patch.avatar !== undefined) current.avatar = C.sanitizeText(patch.avatar, 4);
    if (patch.accent !== undefined) current.accent = C.sanitizeColor(patch.accent, current.accent);
    if (patch.stealth !== undefined) current.stealth = patch.stealth === true;
    if (patch.decoy !== undefined) current.decoy = patch.decoy === true;
    if (patch.schedule !== undefined) current.schedule = C.normalizeSchedule(patch.schedule);
    if (patch.temporary !== undefined) current.temporary = C.normalizeTemporary(patch.temporary);
    if (patch.template && C.PROFILE_TEMPLATES[patch.template]) current.template = patch.template;
    if (patch.role !== undefined && hasPermission(vault, profileId, "admin")) current.role = patch.role === "admin" ? "admin" : C.sanitizeText(patch.role, 20);
    vault.profileSettings[targetId] = { ...(vault.profileSettings[targetId] || defaultProfileSettingsFor(current)), accent: current.accent };
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "profile_updated", detail: targetId });
    return publicSnapshot(state, session, vault);
  });
}

async function updateProfileSettings(message) {
  return withUnlockedMutation("profile settings", async ({ state, session, vault, profileId }) => {
    const targetId = message.profileId || profileId;
    if (!state.profiles[targetId]) throw new Error("INVALID_PROFILE");
    if (targetId === profileId) requirePermission(vault, profileId, "access_settings");
    else requirePermission(vault, profileId, "manage_profiles");
    const current = vault.profileSettings[targetId] || defaultProfileSettingsFor(state.profiles[targetId]);
    const patch = message.patch && typeof message.patch === "object" ? message.patch : {};
    const merged = { ...current, ...patch };
    const normalized = C.normalizeVault({ profileSettings: { [targetId]: merged } }, { [targetId]: state.profiles[targetId] }).profileSettings[targetId];
    vault.profileSettings[targetId] = normalized;
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "profile_settings_updated", detail: targetId });
    return publicSnapshot(state, session, vault);
  });
}

async function changeProfilePassword(message) {
  return withUnlockedMutation("change password", async ({ state, session, vault, profileId }) => {
    const targetId = message.profileId || profileId;
    const target = state.profiles[targetId];
    if (!target) throw new Error("INVALID_PROFILE");
    if (targetId === profileId) {
      if (!(await C.verifyCredential(message.currentPassword, target.credential))) throw new Error("WRONG_PASSWORD");
    } else {
      requirePermission(vault, profileId, "manage_profiles");
    }
    if (!C.isValidPassword(message.newPassword)) throw new Error("PASSWORD_TOO_SHORT");
    target.credential = await C.createCredential(message.newPassword);
    if (state.encryption.enabled) {
      const key = sessionVaultKey(session);
      target.vaultWrap = await C.wrapVaultKey(key, message.newPassword);
    }
    vault.securityLog = C.addLog(vault.securityLog, { profileId, action: "password_changed", detail: targetId });
    return publicSnapshot(state, session, vault);
  });
}

async function deleteProfile(message) {
  return withUnlockedMutation("delete profile", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "manage_profiles");
    const targetId = message.profileId;
    if (!state.profiles[targetId] || targetId === profileId) throw new Error("INVALID_PROFILE");
    delete state.profiles[targetId];
    state.profileOrder = state.profileOrder.filter((id) => id !== targetId);
    delete vault.profileSettings[targetId];
    for (const [id, owner] of Object.entries(vault.conversationOwners)) if (owner === targetId) delete vault.conversationOwners[id];
    for (const [id, owner] of Object.entries(vault.projectOwners)) if (owner === targetId) delete vault.projectOwners[id];
    vault.rules = vault.rules.filter((rule) => rule.profileId !== targetId);
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "profile_deleted", detail: targetId });
    return publicSnapshot(state, session, vault);
  });
}

async function bulkAssign(message) {
  return withUnlockedMutation("bulk assignment", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "bulk_assign");
    const targetId = message.targetProfileId;
    if (!state.profiles[targetId]) throw new Error("INVALID_PROFILE");
    let changed = 0;
    for (const raw of (Array.isArray(message.conversationIds) ? message.conversationIds : []).slice(0, 5000)) {
      const id = C.normalizeConversationId(raw);
      if (!id) continue;
      vault.conversationOwners[id] = targetId;
      changed += 1;
    }
    for (const raw of (Array.isArray(message.projectIds) ? message.projectIds : []).slice(0, 1000)) {
      const id = C.normalizeProjectId(raw);
      if (!id) continue;
      vault.projectOwners[id] = targetId;
      changed += 1;
    }
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "bulk_assign", detail: `${changed} to ${targetId}` });
    return { snapshot: publicSnapshot(state, session, vault), changed };
  });
}

async function addRule(message) {
  return withUnlockedMutation("rule change", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "manage_rules");
    const rule = {
      id: C.createId("rule"),
      type: message.rule && message.rule.type,
      profileId: message.rule && message.rule.profileId,
      projectId: message.rule && message.rule.projectId,
      siteId: message.rule && message.rule.siteId,
      contains: message.rule && message.rule.contains,
      enabled: message.rule ? message.rule.enabled !== false : true,
      priority: message.rule && message.rule.priority
    };
    const normalized = C.normalizeVault({ rules: [rule] }, state.profiles).rules[0];
    if (!normalized) throw new Error("INVALID_RULE");
    vault.rules.push(normalized);
    vault.rules.sort((a, b) => b.priority - a.priority);
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "rule_added", detail: normalized.id });
    return { snapshot: publicSnapshot(state, session, vault), rule: normalized };
  });
}

async function deleteRule(message) {
  return withUnlockedMutation("rule change", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "manage_rules");
    vault.rules = vault.rules.filter((rule) => rule.id !== message.ruleId);
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "rule_deleted", detail: C.sanitizeText(message.ruleId, 80) });
    return publicSnapshot(state, session, vault);
  });
}

async function setMode(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    if (message.mode === "presentation") session.presentationMode = message.enabled === true;
    if (message.mode === "screenshot") session.screenshotMode = message.enabled === true;
    session.lastActivityAt = Date.now();
    await writeSession(session);
    await broadcast();
    const vault = await loadVault(state, session);
    return publicSnapshot(state, session, vault);
  });
}

async function updateGlobalSettings(message) {
  return withUnlockedMutation("global settings", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "manage_global");
    const patch = message.patch && typeof message.patch === "object" ? message.patch : {};
    vault.globalSettings = {
      ...vault.globalSettings,
      autoAssignNew: patch.autoAssignNew === undefined ? vault.globalSettings.autoAssignNew !== false : patch.autoAssignNew === true,
      promptUnassigned: patch.promptUnassigned === undefined ? vault.globalSettings.promptUnassigned !== false : patch.promptUnassigned === true,
      syncAllTabs: patch.syncAllTabs === undefined ? vault.globalSettings.syncAllTabs !== false : patch.syncAllTabs === true,
      localBackups: patch.localBackups === undefined ? vault.globalSettings.localBackups !== false : patch.localBackups === true,
      backupLimit: patch.backupLimit === undefined ? vault.globalSettings.backupLimit : Math.min(C.MAX_BACKUPS, Math.max(1, Number(patch.backupLimit) || C.MAX_BACKUPS))
    };
    vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "global_settings_updated" });
    return publicSnapshot(state, session, vault);
  });
}

async function openDashboard() {
  await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  return { opened: true };
}

async function getDashboard() {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  assertUnlocked(state, session);
  const vault = await loadVault(state, session);
  const profileId = state.activeProfileId;
  requirePermission(vault, profileId, "access_settings");
  const admin = hasPermission(vault, profileId, "admin");
  const conversations = [];
  for (const [id, ownerId] of Object.entries(vault.conversationOwners)) {
    if (!admin && ownerId !== profileId) continue;
    conversations.push({ id, ownerId, ...(vault.conversationMeta[id] || {}) });
  }
  if (admin) {
    for (const [id, meta] of Object.entries(vault.conversationMeta)) {
      if (!vault.conversationOwners[id]) conversations.push({ id, ownerId: null, ...meta });
    }
  }
  const projects = [];
  for (const [id, ownerId] of Object.entries(vault.projectOwners)) {
    if (!admin && ownerId !== profileId) continue;
    projects.push({ id, ownerId, ...(vault.projectMeta[id] || {}) });
  }
  if (admin) {
    for (const [id, meta] of Object.entries(vault.projectMeta)) {
      if (!vault.projectOwners[id]) projects.push({ id, ownerId: null, ...meta });
    }
  }
  const stats = {};
  for (const id of state.profileOrder) {
    stats[id] = {
      conversations: Object.values(vault.conversationOwners).filter((owner) => owner === id).length,
      projects: Object.values(vault.projectOwners).filter((owner) => owner === id).length,
      favorites: Object.entries(vault.conversationMeta).filter(([entityId, meta]) => vault.conversationOwners[entityId] === id && meta.favorite).length,
      recent: Object.entries(vault.conversationMeta).filter(([entityId, meta]) => vault.conversationOwners[entityId] === id && Number(meta.lastSeenAt) > Date.now() - 7 * 86400000).length
    };
  }
  const storage = await chrome.storage.local.getBytesInUse(null).catch(() => 0);
  const backupsResult = await chrome.storage.local.get(C.BACKUPS_KEY);
  const backups = Array.isArray(backupsResult[C.BACKUPS_KEY]) ? backupsResult[C.BACKUPS_KEY] : [];
  return {
    snapshot: publicSnapshot(state, session, vault),
    activeProfileId: profileId,
    isAdmin: admin,
    conversations: conversations.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0)),
    projects: projects.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0)),
    profiles: state.profileOrder.map((id) => C.profilePublic(state.profiles[id], false)),
    profileSettings: admin ? vault.profileSettings : { [profileId]: vault.profileSettings[profileId] },
    rules: admin ? vault.rules : vault.rules.filter((rule) => rule.profileId === profileId),
    globalSettings: vault.globalSettings,
    activityLog: hasPermission(vault, profileId, "view_logs") ? vault.activityLog.slice().reverse() : vault.activityLog.filter((entry) => entry.profileId === profileId).slice().reverse(),
    securityLog: hasPermission(vault, profileId, "view_logs") ? vault.securityLog.slice().reverse() : vault.securityLog.filter((entry) => entry.profileId === profileId).slice().reverse(),
    stats,
    storageBytes: storage,
    backups: backups.slice().reverse().map((backup) => ({ id: backup.id, ts: backup.ts, label: backup.label }))
  };
}

async function cleanup(message) {
  return withUnlockedMutation("cleanup", async ({ state, session, vault, profileId }) => {
    requirePermission(vault, profileId, "cleanup");
    const findings = { orphanConversationOwners: [], orphanProjectOwners: [], unassignedConversationMeta: [], unassignedProjectMeta: [], projectMismatches: [] };
    for (const [id, owner] of Object.entries(vault.conversationOwners)) if (!state.profiles[owner]) findings.orphanConversationOwners.push(id);
    for (const [id, owner] of Object.entries(vault.projectOwners)) if (!state.profiles[owner]) findings.orphanProjectOwners.push(id);
    for (const id of Object.keys(vault.conversationMeta)) if (!vault.conversationOwners[id]) findings.unassignedConversationMeta.push(id);
    for (const id of Object.keys(vault.projectMeta)) if (!vault.projectOwners[id]) findings.unassignedProjectMeta.push(id);
    for (const [id, meta] of Object.entries(vault.conversationMeta)) {
      if (!meta.projectId) continue;
      const convOwner = vault.conversationOwners[id];
      const projectOwner = vault.projectOwners[meta.projectId];
      if (convOwner && projectOwner && convOwner !== projectOwner) findings.projectMismatches.push({ id, projectId: meta.projectId, convOwner, projectOwner });
    }
    if (message.fix === true) {
      for (const id of findings.orphanConversationOwners) delete vault.conversationOwners[id];
      for (const id of findings.orphanProjectOwners) delete vault.projectOwners[id];
      for (const id of findings.unassignedConversationMeta) delete vault.conversationMeta[id];
      for (const id of findings.unassignedProjectMeta) delete vault.projectMeta[id];
      for (const mismatch of findings.projectMismatches) vault.conversationOwners[mismatch.id] = mismatch.projectOwner;
      vault.activityLog = C.addLog(vault.activityLog, { profileId, action: "cleanup_fixed", detail: JSON.stringify(Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]))) });
    }
    return { snapshot: publicSnapshot(state, session, vault), findings };
  });
}

async function restoreBackup(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    const vault = await loadVault(state, session);
    requirePermission(vault, state.activeProfileId, "admin");
    const result = await chrome.storage.local.get(C.BACKUPS_KEY);
    const backups = Array.isArray(result[C.BACKUPS_KEY]) ? result[C.BACKUPS_KEY] : [];
    const backup = message.backupId ? backups.find((item) => item.id === message.backupId) : backups[backups.length - 1];
    if (!backup || !backup.state) throw new Error("NO_BACKUP");
    await createBackup(state, "before restore");
    const restored = C.normalizeState(backup.state);
    await writeStored(restored);
    // The same encryption key is retained for normal mutations. If a very old backup changes key, lock safely.
    let nextSession = session;
    try { await loadVault(restored, session); }
    catch (_error) { nextSession = blankSession(); await writeSession(nextSession); }
    await broadcast();
    return getSnapshot();
  });
}

async function exportTransferCode() {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  assertUnlocked(state, session);
  const vault = await loadVault(state, session);
  requirePermission(vault, state.activeProfileId, "export_all");
  return { code: C.transferCodeFromState(state) };
}

async function importTransferCode(message) {
  return serialized(async () => {
    const imported = C.transferCodeToState(message.code);
    const current = await readStored();
    const session = await readSession();
    if (!current.configured) {
      await writeStored(imported);
      await writeSession(blankSession());
      await broadcast();
      return { snapshot: publicSnapshot(imported, blankSession(), null), importedProfiles: imported.profileOrder.length, importedEntities: 0, conflicts: 0 };
    }
    assertUnlocked(current, session);
    const currentVault = await loadVault(current, session);
    requirePermission(currentVault, current.activeProfileId, "export_all");
    // Same-family transfer codes share a vault key and can be merged without a server.
    let importedVault;
    if (imported.encryption.enabled && current.encryption.enabled) {
      importedVault = await C.decryptJsonWithRawKey(imported.encryption.encryptedVault, sessionVaultKey(session)).then((v) => C.normalizeVault(v, imported.profiles)).catch(() => null);
    } else if (!imported.encryption.enabled) {
      importedVault = C.normalizeVault(imported.legacyVault, imported.profiles);
    }
    if (!importedVault) throw new Error("TRANSFER_DIFFERENT_VAULT");
    let importedProfiles = 0;
    for (const id of imported.profileOrder) {
      if (!current.profiles[id]) {
        current.profiles[id] = imported.profiles[id];
        current.profileOrder.push(id);
        importedProfiles += 1;
      }
    }
    let importedEntities = 0;
    let conflicts = 0;
    for (const [id, owner] of Object.entries(importedVault.conversationOwners)) {
      if (!currentVault.conversationOwners[id]) { currentVault.conversationOwners[id] = owner; importedEntities += 1; }
      else if (currentVault.conversationOwners[id] !== owner) conflicts += 1;
      if (!currentVault.conversationMeta[id] && importedVault.conversationMeta[id]) currentVault.conversationMeta[id] = importedVault.conversationMeta[id];
    }
    for (const [id, owner] of Object.entries(importedVault.projectOwners)) {
      if (!currentVault.projectOwners[id]) { currentVault.projectOwners[id] = owner; importedEntities += 1; }
      else if (currentVault.projectOwners[id] !== owner) conflicts += 1;
      if (!currentVault.projectMeta[id] && importedVault.projectMeta[id]) currentVault.projectMeta[id] = importedVault.projectMeta[id];
    }
    for (const id of current.profileOrder) {
      if (!currentVault.profileSettings[id]) currentVault.profileSettings[id] = importedVault.profileSettings[id] || defaultProfileSettingsFor(current.profiles[id]);
    }
    await persistVault(current, session, currentVault, "import transfer");
    await broadcast();
    return { snapshot: publicSnapshot(current, session, currentVault), importedProfiles, importedEntities, conflicts };
  });
}

async function exportDuochatFile(message) {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  assertUnlocked(state, session);
  const vault = await loadVault(state, session);
  if (!hasPermission(vault, state.activeProfileId, "export_all") && !hasPermission(vault, state.activeProfileId, "export_own")) throw new Error("PERMISSION_DENIED");
  const backupsResult = await chrome.storage.local.get(C.BACKUPS_KEY);
  const language = (await getLanguage()).language;
  const bundle = {
    format: "duochat-portable-1",
    exportedAt: new Date().toISOString(),
    state,
    backups: hasPermission(vault, state.activeProfileId, "export_all") ? (backupsResult[C.BACKUPS_KEY] || []) : [],
    language
  };
  return { filename: `DuoChat-${new Date().toISOString().slice(0, 10)}.duochat`, content: await C.encryptPortableBundle(bundle, message.passphrase) };
}

async function importDuochatFile(message) {
  return serialized(async () => {
    const bundle = await C.decryptPortableBundle(message.content, message.passphrase);
    if (!bundle || bundle.format !== "duochat-portable-1" || !bundle.state) throw new Error("INVALID_DUOCHAT_FILE");
    const current = await readStored();
    const session = await readSession();
    if (current.configured) {
      assertUnlocked(current, session);
      const vault = await loadVault(current, session);
      requirePermission(vault, current.activeProfileId, "admin");
      await createBackup(current, "before file import");
    }
    const imported = C.normalizeState(bundle.state);
    await writeStored(imported);
    if (Array.isArray(bundle.backups)) await chrome.storage.local.set({ [C.BACKUPS_KEY]: bundle.backups.slice(-C.MAX_BACKUPS) });
    if (I.normalizeLanguage(bundle.language)) await chrome.storage.local.set({ [C.LANGUAGE_KEY]: I.normalizeLanguage(bundle.language) });
    await writeSession(blankSession());
    await broadcast();
    return { snapshot: publicSnapshot(imported, blankSession(), null) };
  });
}

async function enableEncryption(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readStored(), readSession()]);
    assertUnlocked(state, session);
    if (state.encryption.enabled) return { snapshot: await getSnapshot(), recoveryKey: null };
    const vault = C.normalizeVault(state.legacyVault, state.profiles);
    requirePermission(vault, state.activeProfileId, "admin");
    const passwords = message.passwords && typeof message.passwords === "object" ? message.passwords : {};
    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    for (const id of state.profileOrder) {
      const password = passwords[id];
      if (!(await C.verifyCredential(password, state.profiles[id].credential))) throw new Error(`PROFILE_PASSWORD_REQUIRED:${id}`);
      state.profiles[id].vaultWrap = await C.wrapVaultKey(vaultKey, password);
    }
    const recoveryKey = C.generateRecoveryKey();
    state.encryption = {
      enabled: true,
      encryptedVault: await C.encryptJsonWithRawKey(vault, vaultKey),
      recoveryWrap: await C.wrapVaultKey(vaultKey, recoveryKey)
    };
    state.legacyVault = null;
    session.vaultKey = C.bytesToBase64(vaultKey);
    await writeStored(state);
    await writeSession(session);
    await broadcast();
    return { snapshot: publicSnapshot(state, session, vault), recoveryKey };
  });
}

async function userActivity() {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  if (!state.configured || session.unlockedProfileId !== state.activeProfileId) return { ok: true };
  session.lastActivityAt = Date.now();
  await writeSession(session);
  return { ok: true };
}

async function toggleFavorite(message) {
  const snapshot = await upsertEntityMeta({
    entityType: message.entityType,
    entityId: message.entityId,
    patch: { favorite: message.favorite === true }
  });
  return snapshot;
}


const GITHUB_REPOSITORY = "dzvellox/DuoChat";
const UPDATE_STATE_KEY = "__duochat_github_update_v1";
const UPDATE_PREFS_KEY = "__duochat_github_update_prefs_v1";
const UPDATE_ALARM = "duochat-github-updates";
const UPDATE_PERIOD_MINUTES = 360;

function parseVersion(value) {
  const match = String(value || "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+]([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return { major:Number(match[1]), minor:Number(match[2]), patch:Number(match[3]), pre:match[4] || "" };
}

function compareVersions(aValue, bValue) {
  const a=parseVersion(aValue), b=parseVersion(bValue);
  if (!a || !b) return 0;
  for (const key of ["major","minor","patch"]) if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre.localeCompare(b.pre, undefined, { numeric:true, sensitivity:"base" });
}

async function readUpdatePrefs() {
  const raw=(await chrome.storage.local.get(UPDATE_PREFS_KEY))[UPDATE_PREFS_KEY] || {};
  return { channel: raw.channel === "beta" ? "beta" : "stable" };
}

async function setUpdateChannel(message) {
  const channel=message && message.channel === "beta" ? "beta" : "stable";
  await chrome.storage.local.set({[UPDATE_PREFS_KEY]:{channel}});
  return checkGithubUpdate(true);
}

function pickGithubRelease(releases, channel) {
  const usable=(Array.isArray(releases)?releases:[]).filter((release)=>release && !release.draft && release.tag_name && (channel === "beta" || !release.prerelease));
  usable.sort((a,b)=>compareVersions(b.tag_name,a.tag_name));
  return usable[0] || null;
}

function pickReleaseAsset(release, version) {
  const assets=Array.isArray(release && release.assets)?release.assets:[];
  const exact=assets.find((asset)=>asset && typeof asset.name === "string" && asset.name.toLowerCase() === `duochat-${version}.zip`.toLowerCase());
  const generic=assets.find((asset)=>asset && typeof asset.name === "string" && /^duochat[-_].*\.zip$/i.test(asset.name));
  return exact || generic || null;
}

function trustedGithubReleaseUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    if (!url.pathname.startsWith(`/${GITHUB_REPOSITORY}/releases`)) return null;
    return url.href;
  } catch (_error) { return null; }
}

function trustedGithubAssetUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    if (!url.pathname.startsWith(`/${GITHUB_REPOSITORY}/releases/download/`)) return null;
    return url.href;
  } catch (_error) { return null; }
}

async function saveUpdateStatus(status) {
  await chrome.storage.local.set({[UPDATE_STATE_KEY]:status});
  try {
    await chrome.action.setBadgeText({text:status && status.updateAvailable ? "UPD" : ""});
    if (status && status.updateAvailable) await chrome.action.setBadgeBackgroundColor({color:"#6d5dfc"});
  } catch (_error) { /* badge is optional */ }
  return status;
}

async function checkGithubUpdate(force=false) {
  const currentVersion=chrome.runtime.getManifest().version;
  const prefs=await readUpdatePrefs();
  const previous=(await chrome.storage.local.get(UPDATE_STATE_KEY))[UPDATE_STATE_KEY] || null;
  if (!force && previous && previous.channel === prefs.channel && Date.now() - Number(previous.checkedAt || 0) < 30 * 60 * 1000) return previous;
  try {
    const response=await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=20`, {
      cache:"no-store",
      headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
    });
    if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`);
    const releases=await response.json();
    const release=pickGithubRelease(releases,prefs.channel);
    if (!release) throw new Error("NO_GITHUB_RELEASE");
    const latestVersion=String(release.tag_name).replace(/^v/i,"");
    const asset=pickReleaseAsset(release,latestVersion);
    const status={
      checkedAt:Date.now(), channel:prefs.channel, currentVersion, latestVersion,
      updateAvailable:compareVersions(latestVersion,currentVersion)>0,
      releaseName:String(release.name || release.tag_name || latestVersion).slice(0,200),
      releaseUrl:trustedGithubReleaseUrl(release.html_url) || `https://github.com/${GITHUB_REPOSITORY}/releases`,
      assetUrl:asset && asset.browser_download_url ? trustedGithubAssetUrl(asset.browser_download_url) : null,
      assetName:asset && asset.name ? String(asset.name).slice(0,255) : null,
      assetDigest:asset && typeof asset.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(asset.digest) ? asset.digest.toLowerCase() : null,
      publishedAt:release.published_at || release.created_at || null,
      notes:String(release.body || "").slice(0,6000), error:null
    };
    return saveUpdateStatus(status);
  } catch (error) {
    const status={checkedAt:Date.now(),channel:prefs.channel,currentVersion,latestVersion:null,updateAvailable:false,releaseName:null,releaseUrl:`https://github.com/${GITHUB_REPOSITORY}/releases`,assetUrl:null,assetName:null,assetDigest:null,publishedAt:null,notes:"",error:error && error.message ? error.message : "GITHUB_UPDATE_ERROR"};
    return saveUpdateStatus(status);
  }
}

async function getUpdateStatus() {
  const prefs=await readUpdatePrefs();
  const stored=(await chrome.storage.local.get(UPDATE_STATE_KEY))[UPDATE_STATE_KEY] || null;
  if (!stored || stored.channel !== prefs.channel) return checkGithubUpdate(false);
  return {...stored,currentVersion:chrome.runtime.getManifest().version,channel:prefs.channel};
}

async function downloadGithubUpdate() {
  const status=await checkGithubUpdate(false);
  if (!status.updateAvailable) throw new Error("NO_UPDATE_AVAILABLE");
  const assetUrl = trustedGithubAssetUrl(status.assetUrl);
  if (!assetUrl) throw new Error("UPDATE_ZIP_NOT_FOUND");
  const id=await chrome.downloads.download({url:assetUrl,filename:status.assetName || `DuoChat-${status.latestVersion}.zip`,saveAs:true,conflictAction:"uniquify"});
  return {downloadId:id,latestVersion:status.latestVersion,assetName:status.assetName,assetDigest:status.assetDigest || null};
}

async function openGithubRelease() {
  const status=await getUpdateStatus();
  const url = trustedGithubReleaseUrl(status.releaseUrl) || `https://github.com/${GITHUB_REPOSITORY}/releases`;
  await chrome.tabs.create({url});
  return true;
}

async function handleMessage(message, sender, context) {
  switch (message && message.type) {
    case "GET_SNAPSHOT": return getSnapshot();
    case "GET_LANGUAGE": return getLanguage();
    case "SET_LANGUAGE": return setLanguage(message);
    case "CONFIGURE": {
      const result = await configureLegacyMessage(message);
      return result.snapshot;
    }
    case "CONFIGURE_ADVANCED": return configureAdvanced(message);
    case "UNLOCK": return unlock(message);
    case "RECOVERY_UNLOCK": return recoveryUnlock(message);
    case "BEGIN_WEBAUTHN_REGISTRATION": return beginWebauthn(message, "register");
    case "FINISH_WEBAUTHN_REGISTRATION": return finishWebauthnRegistration(message);
    case "BEGIN_WEBAUTHN_AUTHENTICATION": return beginWebauthn(message, "authenticate");
    case "DISABLE_WEBAUTHN": return disableWebauthn();
    case "LOCK": return lock("manual", false);
    case "LOGICAL_LOGOUT": return lock("logical logout", false);
    case "PANIC_LOCK": return lock("panic", true);
    case "SET_RECOVERY_MODE": return getSnapshot();
    case "CLAIM_CONVERSATION": return claimConversations(message);
    case "CLAIM_CONVERSATIONS": return claimConversations(message);
    case "CLAIM_PROJECT": return claimProjects(message);
    case "CLAIM_PROJECTS": return claimProjects(message);
    case "CLAIM_PROJECT_WITH_CONVERSATIONS": return claimProjectAndConversations(message);
    case "AUTO_ASSIGN_ENTITY": return autoAssign(message);
    case "RECORD_UNASSIGNED_ENTITY": return recordUnassignedEntity(message);
    case "SMART_MIGRATION": return smartMigration(message);
    case "SMART_MIGRATION_APPLY": return applySmartMigration(message);
    case "UPSERT_ENTITY_META": return upsertEntityMeta(message);
    case "SET_ENTITY_LOCK": return setEntityLock(message);
    case "AUTHORIZE_ENTITY": return authorizeEntity(message);
    case "RECORD_SECURITY_EVENT": return recordSecurity(message);
    case "ADD_PROFILE": return addProfile(message);
    case "UPDATE_PROFILE": return updateProfile(message);
    case "UPDATE_PROFILE_SETTINGS": return updateProfileSettings(message);
    case "CHANGE_PROFILE_PASSWORD": return changeProfilePassword(message);
    case "DELETE_PROFILE": return deleteProfile(message);
    case "BULK_ASSIGN": return bulkAssign(message);
    case "ADD_RULE": return addRule(message);
    case "DELETE_RULE": return deleteRule(message);
    case "SET_MODE": return setMode(message);
    case "UPDATE_GLOBAL_SETTINGS": return updateGlobalSettings(message);
    case "OPEN_DASHBOARD_REQUEST": return openDashboard();
    case "GET_DASHBOARD": return getDashboard();
    case "CLEANUP": return cleanup(message);
    case "RESTORE_BACKUP": return restoreBackup(message);
    case "EXPORT_TRANSFER_CODE": return exportTransferCode();
    case "IMPORT_TRANSFER_CODE": return importTransferCode(message);
    case "EXPORT_DUOCHAT_FILE": return exportDuochatFile(message);
    case "IMPORT_DUOCHAT_FILE": return importDuochatFile(message);
    case "ENABLE_ENCRYPTION": return enableEncryption(message);
    case "USER_ACTIVITY": return userActivity();
    case "TOGGLE_FAVORITE": return toggleFavorite(message);
    case "GET_UPDATE_STATUS": return getUpdateStatus();
    case "CHECK_GITHUB_UPDATE": return checkGithubUpdate(true);
    case "SET_UPDATE_CHANNEL": return setUpdateChannel(message);
    case "DOWNLOAD_GITHUB_UPDATE": return downloadGithubUpdate();
    case "OPEN_GITHUB_RELEASE": return openGithubRelease();
    case "OPEN_SUPPORT": return openSupport();
    case "OPEN_SECURE_AUTH": return openSecureAuth(message, sender);
    case "GET_SECURE_REQUEST": return getSecureRequest(message);
    case "CLEAR_SECURE_REQUEST": return clearSecureRequest(message);
    case "CLOSE_SECURE_AUTH": return closeSecureAuth(message, sender);
    default: throw new Error("UNKNOWN_MESSAGE");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const context = senderContext(sender);
  try { assertMessageContext(message, context); }
  catch (error) { sendResponse({ ok: false, error: error.message || "UNAUTHORIZED_SENDER" }); return false; }
  handleMessage(message, sender, context)
    .then((data) => sendResponse({ ok: true, data: redactResponseForContext(data, context) }))
    .catch((error) => sendResponse({ ok: false, error: error && error.message ? error.message : "UNKNOWN_ERROR" }));
  return true;
});

async function checkAutoLock() {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  if (!state.configured || session.unlockedProfileId !== state.activeProfileId) return;
  let vault;
  try { vault = await loadVault(state, session); } catch (_error) { await lock("vault unavailable"); return; }
  const settings = vault.profileSettings[state.activeProfileId] || {};
  const minutes = Math.max(0, Number(settings.autoLockMinutes) || 0);
  if (minutes > 0 && session.lastActivityAt && Date.now() - session.lastActivityAt >= minutes * 60000) {
    await lock("inactivity");
  }
}

async function cleanupTemporaryProfiles() {
  const [state, session] = await Promise.all([readStored(), readSession()]);
  if (!state.configured) return;
  let vault;
  try {
    vault = state.encryption.enabled && !session.vaultKey ? null : await loadVault(state, session);
  } catch (_error) { vault = null; }
  if (!vault) return;
  const now = Date.now();
  const toDelete = state.profileOrder.filter((id) => {
    const temp = state.profiles[id] && state.profiles[id].temporary;
    return temp && (temp.expired === true || (temp.mode === "hours" && temp.expiresAt && temp.expiresAt <= now));
  });
  if (!toDelete.length) return;
  for (const targetId of toDelete) {
    if (targetId === state.activeProfileId) continue;
    delete state.profiles[targetId];
    state.profileOrder = state.profileOrder.filter((id) => id !== targetId);
    delete vault.profileSettings[targetId];
    for (const [id, owner] of Object.entries(vault.conversationOwners)) if (owner === targetId) delete vault.conversationOwners[id];
    for (const [id, owner] of Object.entries(vault.projectOwners)) if (owner === targetId) delete vault.projectOwners[id];
  }
  await persistVault(state, session, vault, "temporary profile cleanup");
  await broadcast();
}

async function markSessionGuestsExpired() {
  const state = await readStored();
  if (!state.configured) return;
  let changed = false;
  for (const id of state.profileOrder) {
    const profile = state.profiles[id];
    if (profile && profile.temporary && profile.temporary.mode === "session" && profile.temporary.expired !== true) {
      profile.temporary = { ...profile.temporary, expired: true };
      changed = true;
    }
  }
  if (changed) await writeStored(state);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "lock-duochat") await lock("keyboard shortcut", false);
  if (command === "panic-duochat") await lock("panic shortcut", true);
  if (command === "profile-picker") await broadcast({ type: "DUOCHAT_PROFILE_PICKER" });
  if (command === "screenshot-mode") {
    try {
      const snapshot = await getSnapshot();
      if (snapshot.unlocked) await setMode({ mode: "screenshot", enabled: !snapshot.screenshotMode });
    } catch (_error) { /* ignore */ }
  }
});

if (chrome.idle) {
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState !== "locked") return;
    const [state, session] = await Promise.all([readStored(), readSession()]);
    if (!state.configured || session.unlockedProfileId !== state.activeProfileId) return;
    try {
      const vault = await loadVault(state, session);
      const settings = vault.profileSettings[state.activeProfileId] || {};
      if (settings.lockOnSystemLock !== false) await lock("system locked");
    } catch (_error) { await lock("system locked"); }
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "duochat-maintenance") {
    await checkAutoLock();
    await cleanupTemporaryProfiles();
  }
  if (alarm.name === UPDATE_ALARM) await checkGithubUpdate(true).catch(() => undefined);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("duochat-maintenance", { periodInMinutes: 1 });
  chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_PERIOD_MINUTES });
  checkGithubUpdate(true).catch(() => undefined);
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("duochat-maintenance", { periodInMinutes: 1 });
  chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_PERIOD_MINUTES });
  checkGithubUpdate(false).catch(() => undefined);
  // Mark session guests as expired without decrypting the vault. They are purged on the next authorized unlock.
  await markSessionGuestsExpired().catch(() => undefined);
  await cleanupTemporaryProfiles().catch(() => undefined);
});
chrome.alarms.create("duochat-maintenance", { periodInMinutes: 1 });
chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_PERIOD_MINUTES });
