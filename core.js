(function initDuoChatCore(globalScope) {
  "use strict";

  const STORAGE_KEY = "duochatState";
  const SESSION_KEY = "duochatSession";
  const INITIAL_PROFILE_IDS = Object.freeze(["A", "B"]);
  const PBKDF2_ITERATIONS = 310000;
  const MIN_PASSWORD_LENGTH = 6;
  const TRANSFER_CODE_PREFIX = "DUOCHAT1.";
  const MAX_TRANSFER_CODE_LENGTH = 5_000_000;
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

  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function sanitizeName(value, fallback) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim().slice(0, 30);
    return normalized || fallback;
  }

  function isValidProfileId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
  }

  function isValidPassword(value) {
    return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;
  }

  function createProfileId(existingProfiles = {}) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      const id = `p_${bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
      if (!existingProfiles[id]) return id;
    }
    throw new Error("PROFILE_ID_GENERATION_FAILED");
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
    if (stripChatGptProjectPrefix && siteId === "chatgpt" && rawId.startsWith("g-p-")) {
      rawId = rawId.slice(4);
    }
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(rawId)) return null;
    return `${siteId}:${rawId}`;
  }

  function normalizeConversationId(value, defaultSiteId = "chatgpt") {
    return normalizeEntityId(value, defaultSiteId, false);
  }

  function extractConversationId(input) {
    try {
      const url = new URL(String(input), "https://chatgpt.com");
      const site = getSupportedSite(url.href);
      if (!site) return null;
      const pattern = site.id === "chatgpt"
        ? /(?:^|\/)c\/([a-zA-Z0-9_-]{6,128})(?:\/|$)/
        : /(?:^|\/)chat\/([a-zA-Z0-9_-]{6,128})(?:\/|$)/;
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
        const prefixedMatch = url.pathname.match(/(?:^|\/)(g-p-[a-zA-Z0-9_-]{6,128})(?:\/|$)/);
        if (prefixedMatch) return normalizeProjectId(prefixedMatch[1], site.id);
      }
      const routeMatch = url.pathname.match(/(?:^|\/)projects?\/([a-zA-Z0-9_-]{6,128})(?:\/|$)/);
      return routeMatch ? normalizeProjectId(routeMatch[1], site.id) : null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeProjectId(value, defaultSiteId = "chatgpt") {
    // ChatGPT expose parfois le même projet avec ou sans le préfixe "g-p-".
    // Le préfixe de plateforme garde aussi les identifiants Claude indépendants.
    return normalizeEntityId(value, defaultSiteId, true);
  }

  async function derivePasswordHash(password, salt, iterations = PBKDF2_ITERATIONS) {
    if (!isValidPassword(password)) throw new Error("PASSWORD_TOO_SHORT");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    );
    return new Uint8Array(bits);
  }

  async function createCredential(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePasswordHash(password, salt);
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
    for (let index = 0; index < left.length; index += 1) {
      difference |= left[index] ^ right[index];
    }
    return difference === 0;
  }

  async function verifyCredential(password, credential) {
    if (!credential || credential.algorithm !== "PBKDF2-SHA256") return false;
    if (!isValidPassword(password)) return false;
    try {
      const expected = base64ToBytes(credential.hash);
      const actual = await derivePasswordHash(
        password,
        base64ToBytes(credential.salt),
        credential.iterations
      );
      return constantTimeEqual(actual, expected);
    } catch (_error) {
      return false;
    }
  }

  function createEmptyState() {
    return {
      version: 5,
      configured: false,
      activeProfileId: null,
      profiles: {},
      profileOrder: [],
      conversationOwners: {},
      projectOwners: {}
    };
  }

  function normalizeState(candidate) {
    const empty = createEmptyState();
    if (!candidate || typeof candidate !== "object") return empty;
    const configured = candidate.configured === true;
    const profiles = {};
    if (candidate.profiles && typeof candidate.profiles === "object") {
      for (const [id, profile] of Object.entries(candidate.profiles)) {
        if (!isValidProfileId(id) || !profile || !profile.credential) continue;
        profiles[id] = {
          id,
          name: sanitizeName(profile.name, `Utilisateur ${id}`),
          credential: profile.credential
        };
      }
    }
    const profileOrder = getProfileIds({ profiles, profileOrder: candidate.profileOrder });
    const conversationOwners = {};
    if (candidate.conversationOwners && typeof candidate.conversationOwners === "object") {
      for (const [rawId, owner] of Object.entries(candidate.conversationOwners)) {
        const id = normalizeConversationId(rawId);
        if (id && profiles[owner]) conversationOwners[id] = owner;
      }
    }
    const projectOwners = {};
    if (candidate.projectOwners && typeof candidate.projectOwners === "object") {
      for (const [rawId, owner] of Object.entries(candidate.projectOwners)) {
        const id = normalizeProjectId(rawId);
        if (id && profiles[owner]) projectOwners[id] = owner;
      }
    }
    return {
      version: 5,
      configured: configured && profileOrder.length >= 2,
      activeProfileId: profiles[candidate.activeProfileId] ? candidate.activeProfileId : profileOrder[0] || null,
      profiles,
      profileOrder,
      conversationOwners,
      projectOwners
    };
  }

  function stateToTransferCode(candidate) {
    const state = normalizeState(candidate);
    if (!state.configured) throw new Error("NOT_CONFIGURED");
    const portable = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: state.profiles,
      profileOrder: state.profileOrder,
      conversationOwners: state.conversationOwners,
      projectOwners: state.projectOwners
    };
    const bytes = new TextEncoder().encode(JSON.stringify(portable));
    const encoded = bytesToBase64(bytes)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    return `${TRANSFER_CODE_PREFIX}${encoded}`;
  }

  function transferCodeToState(value) {
    const code = String(value || "").replace(/\s+/g, "");
    if (!code.startsWith(TRANSFER_CODE_PREFIX) || code.length > MAX_TRANSFER_CODE_LENGTH) {
      throw new Error("INVALID_TRANSFER_CODE");
    }
    try {
      let encoded = code.slice(TRANSFER_CODE_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
      encoded += "=".repeat((4 - (encoded.length % 4)) % 4);
      const portable = JSON.parse(new TextDecoder().decode(base64ToBytes(encoded)));
      if (!portable || portable.version !== 1) throw new Error("INVALID_TRANSFER_CODE");
      const state = normalizeState({
        version: 5,
        configured: true,
        activeProfileId: Array.isArray(portable.profileOrder) ? portable.profileOrder[0] : null,
        profiles: portable.profiles,
        profileOrder: portable.profileOrder,
        conversationOwners: portable.conversationOwners,
        projectOwners: portable.projectOwners
      });
      if (!state.configured) throw new Error("INVALID_TRANSFER_CODE");
      return state;
    } catch (error) {
      if (error && error.message === "INVALID_TRANSFER_CODE") throw error;
      throw new Error("INVALID_TRANSFER_CODE");
    }
  }

  function mergeStates(localCandidate, importedCandidate) {
    const local = normalizeState(localCandidate);
    const imported = normalizeState(importedCandidate);
    if (!imported.configured) throw new Error("INVALID_TRANSFER_CODE");
    if (!local.configured) {
      return {
        state: {
          ...imported,
          activeProfileId: imported.profileOrder[0] || null
        },
        importedProfiles: imported.profileOrder.length,
        importedEntities:
          Object.keys(imported.conversationOwners).length + Object.keys(imported.projectOwners).length,
        conflicts: 0
      };
    }
    const profiles = { ...local.profiles };
    const profileOrder = [...local.profileOrder];
    let importedProfiles = 0;
    for (const id of imported.profileOrder) {
      if (!profiles[id]) {
        profiles[id] = imported.profiles[id];
        profileOrder.push(id);
        importedProfiles += 1;
      }
    }
    const conversationOwners = { ...local.conversationOwners };
    const projectOwners = { ...local.projectOwners };
    let importedEntities = 0;
    let conflicts = 0;
    for (const [id, owner] of Object.entries(imported.conversationOwners)) {
      if (!profiles[owner]) continue;
      if (!conversationOwners[id]) {
        conversationOwners[id] = owner;
        importedEntities += 1;
      } else if (conversationOwners[id] !== owner) conflicts += 1;
    }
    for (const [id, owner] of Object.entries(imported.projectOwners)) {
      if (!profiles[owner]) continue;
      if (!projectOwners[id]) {
        projectOwners[id] = owner;
        importedEntities += 1;
      } else if (projectOwners[id] !== owner) conflicts += 1;
    }
    return {
      state: {
        version: 5,
        configured: true,
        activeProfileId: local.activeProfileId,
        profiles,
        profileOrder,
        conversationOwners,
        projectOwners
      },
      importedProfiles,
      importedEntities,
      conflicts
    };
  }

  const api = Object.freeze({
    STORAGE_KEY,
    SESSION_KEY,
    INITIAL_PROFILE_IDS,
    PBKDF2_ITERATIONS,
    MIN_PASSWORD_LENGTH,
    SUPPORTED_SITES,
    sanitizeName,
    isValidProfileId,
    isValidPassword,
    createProfileId,
    getProfileIds,
    getSupportedSite,
    extractConversationId,
    normalizeConversationId,
    extractProjectId,
    normalizeProjectId,
    createCredential,
    verifyCredential,
    createEmptyState,
    normalizeState,
    stateToTransferCode,
    transferCodeToState,
    mergeStates
  });

  globalScope.DuoChatCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
