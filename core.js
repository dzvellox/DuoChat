(function initDuoChatCore(globalScope) {
  "use strict";

  const STORAGE_KEY = "duochatState";
  const SESSION_KEY = "duochatSession";
  const PROFILE_IDS = Object.freeze(["A", "B"]);
  const PBKDF2_ITERATIONS = 310000;
  const MIN_PASSWORD_LENGTH = 6;

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
    return PROFILE_IDS.includes(value);
  }

  function isValidPassword(value) {
    return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;
  }

  function extractConversationId(input) {
    try {
      const url = new URL(String(input), "https://chatgpt.com");
      if (url.origin !== "https://chatgpt.com") return null;
      const match = url.pathname.match(/(?:^|\/)c\/([a-zA-Z0-9_-]{6,})(?:\/|$)/);
      return match ? match[1] : null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeConversationId(value) {
    const normalized = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{6,128}$/.test(normalized) ? normalized : null;
  }

  function extractProjectId(input) {
    try {
      const url = new URL(String(input), "https://chatgpt.com");
      if (url.origin !== "https://chatgpt.com") return null;
      const queryId = url.searchParams.get("project_id") || url.searchParams.get("projectId");
      if (queryId) return normalizeProjectId(queryId);
      const prefixedMatch = url.pathname.match(/(?:^|\/)(g-p-[a-zA-Z0-9_-]{6,128})(?:\/|$)/);
      if (prefixedMatch) return normalizeProjectId(prefixedMatch[1]);
      const routeMatch = url.pathname.match(/(?:^|\/)projects?\/([a-zA-Z0-9_-]{6,128})(?:\/|$)/);
      return routeMatch ? normalizeProjectId(routeMatch[1]) : null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeProjectId(value) {
    const normalized = String(value || "").trim();
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(normalized)) return null;
    // ChatGPT expose le même projet sous la forme "g-p-<id>" dans la page
    // du projet, puis parfois sous la forme "<id>" dans l'URL d'un chat.
    // Une forme canonique unique évite de redemander son propriétaire.
    return normalized.startsWith("g-p-") ? normalized.slice(4) : normalized;
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
      version: 3,
      configured: false,
      activeProfileId: null,
      profiles: {},
      conversationOwners: {},
      projectOwners: {}
    };
  }

  function normalizeState(candidate) {
    const empty = createEmptyState();
    if (!candidate || typeof candidate !== "object") return empty;
    const configured = candidate.configured === true;
    const profiles = {};
    for (const id of PROFILE_IDS) {
      const profile = candidate.profiles && candidate.profiles[id];
      if (profile && profile.credential) {
        profiles[id] = {
          id,
          name: sanitizeName(profile.name, `Utilisateur ${id}`),
          credential: profile.credential
        };
      }
    }
    const conversationOwners = {};
    if (candidate.conversationOwners && typeof candidate.conversationOwners === "object") {
      for (const [rawId, owner] of Object.entries(candidate.conversationOwners)) {
        const id = normalizeConversationId(rawId);
        if (id && isValidProfileId(owner)) conversationOwners[id] = owner;
      }
    }
    const projectOwners = {};
    if (candidate.projectOwners && typeof candidate.projectOwners === "object") {
      for (const [rawId, owner] of Object.entries(candidate.projectOwners)) {
        const id = normalizeProjectId(rawId);
        if (id && isValidProfileId(owner)) projectOwners[id] = owner;
      }
    }
    return {
      version: 3,
      configured: configured && PROFILE_IDS.every((id) => profiles[id]),
      activeProfileId: isValidProfileId(candidate.activeProfileId) ? candidate.activeProfileId : null,
      profiles,
      conversationOwners,
      projectOwners
    };
  }

  const api = Object.freeze({
    STORAGE_KEY,
    SESSION_KEY,
    PROFILE_IDS,
    PBKDF2_ITERATIONS,
    MIN_PASSWORD_LENGTH,
    sanitizeName,
    isValidProfileId,
    isValidPassword,
    extractConversationId,
    normalizeConversationId,
    extractProjectId,
    normalizeProjectId,
    createCredential,
    verifyCredential,
    createEmptyState,
    normalizeState
  });

  globalScope.DuoChatCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
