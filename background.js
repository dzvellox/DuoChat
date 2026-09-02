"use strict";

importScripts("core.js");

const C = self.DuoChatCore;
let operationQueue = Promise.resolve();

function serialized(task) {
  const pending = operationQueue.then(task, task);
  operationQueue = pending.catch(() => undefined);
  return pending;
}

async function readState() {
  const result = await chrome.storage.local.get(C.STORAGE_KEY);
  return C.normalizeState(result[C.STORAGE_KEY]);
}

async function writeState(state) {
  await chrome.storage.local.set({ [C.STORAGE_KEY]: state });
}

async function readSession() {
  const result = await chrome.storage.session.get(C.SESSION_KEY);
  const candidate = result[C.SESSION_KEY] || {};
  return {
    unlockedProfileId: C.isValidProfileId(candidate.unlockedProfileId)
      ? candidate.unlockedProfileId
      : null,
    recoveryMode: candidate.recoveryMode === true,
    failedAttempts: Number.isInteger(candidate.failedAttempts) ? candidate.failedAttempts : 0,
    blockedUntil: Number.isFinite(candidate.blockedUntil) ? candidate.blockedUntil : 0
  };
}

async function writeSession(session) {
  await chrome.storage.session.set({ [C.SESSION_KEY]: session });
}

function publicSnapshot(state, session) {
  const profiles = {};
  for (const id of C.PROFILE_IDS) {
    if (state.profiles[id]) profiles[id] = { id, name: state.profiles[id].name };
  }
  const unlocked = Boolean(
    state.configured &&
    session.unlockedProfileId &&
    session.unlockedProfileId === state.activeProfileId
  );
  return {
    configured: state.configured,
    activeProfileId: state.activeProfileId,
    profiles,
    conversationOwners: state.conversationOwners,
    projectOwners: state.projectOwners,
    unlocked,
    recoveryMode: unlocked && session.recoveryMode === true
  };
}

async function getSnapshot() {
  const [state, session] = await Promise.all([readState(), readSession()]);
  return publicSnapshot(state, session);
}

async function broadcastRefresh() {
  const tabs = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
  await Promise.allSettled(
    tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "DUOCHAT_REFRESH" }))
  );
}

async function configure(message) {
  return serialized(async () => {
    const current = await readState();
    if (current.configured) throw new Error("ALREADY_CONFIGURED");
    const firstProfileId = C.isValidProfileId(message.firstProfileId) ? message.firstProfileId : "A";
    if (!C.isValidPassword(message.passwordA) || !C.isValidPassword(message.passwordB)) {
      throw new Error("PASSWORD_TOO_SHORT");
    }
    const [credentialA, credentialB] = await Promise.all([
      C.createCredential(message.passwordA),
      C.createCredential(message.passwordB)
    ]);
    const owners = {};
    for (const rawId of Array.isArray(message.conversationIds) ? message.conversationIds : []) {
      const id = C.normalizeConversationId(rawId);
      if (id) owners[id] = firstProfileId;
    }
    const projectOwners = {};
    for (const rawId of Array.isArray(message.projectIds) ? message.projectIds : []) {
      const id = C.normalizeProjectId(rawId);
      if (id) projectOwners[id] = firstProfileId;
    }
    const state = {
      version: 3,
      configured: true,
      activeProfileId: firstProfileId,
      profiles: {
        A: {
          id: "A",
          name: C.sanitizeName(message.nameA, "Utilisateur A"),
          credential: credentialA
        },
        B: {
          id: "B",
          name: C.sanitizeName(message.nameB, "Utilisateur B"),
          credential: credentialB
        }
      },
      conversationOwners: owners,
      projectOwners
    };
    await writeState(state);
    await writeSession({
      unlockedProfileId: firstProfileId,
      recoveryMode: false,
      failedAttempts: 0,
      blockedUntil: 0
    });
    await broadcastRefresh();
    return publicSnapshot(state, await readSession());
  });
}

async function unlock(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readState(), readSession()]);
    const profileId = message.profileId;
    if (!state.configured || !C.isValidProfileId(profileId) || !state.profiles[profileId]) {
      throw new Error("INVALID_PROFILE");
    }
    const now = Date.now();
    if (session.blockedUntil > now) {
      const remaining = Math.max(1, Math.ceil((session.blockedUntil - now) / 1000));
      throw new Error(`TEMPORARILY_BLOCKED:${remaining}`);
    }
    const verified = await C.verifyCredential(message.password, state.profiles[profileId].credential);
    if (!verified) {
      const attempts = session.failedAttempts + 1;
      const mustPause = attempts >= 5;
      await writeSession({
        unlockedProfileId: null,
        recoveryMode: false,
        failedAttempts: mustPause ? 0 : attempts,
        blockedUntil: mustPause ? now + 30000 : 0
      });
      throw new Error(mustPause ? "TEMPORARILY_BLOCKED:30" : "WRONG_PASSWORD");
    }
    state.activeProfileId = profileId;
    await writeState(state);
    const nextSession = {
      unlockedProfileId: profileId,
      recoveryMode: false,
      failedAttempts: 0,
      blockedUntil: 0
    };
    await writeSession(nextSession);
    await broadcastRefresh();
    return publicSnapshot(state, nextSession);
  });
}

async function lock() {
  return serialized(async () => {
    const state = await readState();
    const session = {
      unlockedProfileId: null,
      recoveryMode: false,
      failedAttempts: 0,
      blockedUntil: 0
    };
    await writeSession(session);
    await broadcastRefresh();
    return publicSnapshot(state, session);
  });
}

async function setRecoveryMode(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readState(), readSession()]);
    if (!state.configured || session.unlockedProfileId !== state.activeProfileId) {
      throw new Error("LOCKED");
    }
    session.recoveryMode = message.enabled === true;
    await writeSession(session);
    await broadcastRefresh();
    return publicSnapshot(state, session);
  });
}

async function claimConversations(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readState(), readSession()]);
    if (!state.configured || session.unlockedProfileId !== state.activeProfileId) {
      throw new Error("LOCKED");
    }
    const ids = Array.isArray(message.conversationIds)
      ? message.conversationIds
      : [message.conversationId];
    let changed = false;
    for (const rawId of ids.slice(0, 5000)) {
      const id = C.normalizeConversationId(rawId);
      if (!id) continue;
      const existingOwner = state.conversationOwners[id];
      if (existingOwner && existingOwner !== state.activeProfileId) {
        throw new Error("CONVERSATION_BELONGS_TO_OTHER_PROFILE");
      }
      if (!existingOwner) {
        state.conversationOwners[id] = state.activeProfileId;
        changed = true;
      }
    }
    if (changed) await writeState(state);
    return publicSnapshot(state, session);
  });
}

async function claimProjects(message) {
  return serialized(async () => {
    const [state, session] = await Promise.all([readState(), readSession()]);
    if (!state.configured || session.unlockedProfileId !== state.activeProfileId) {
      throw new Error("LOCKED");
    }
    const ids = Array.isArray(message.projectIds) ? message.projectIds : [message.projectId];
    let changed = false;
    for (const rawId of ids.slice(0, 1000)) {
      const id = C.normalizeProjectId(rawId);
      if (!id) continue;
      const existingOwner = state.projectOwners[id];
      if (existingOwner && existingOwner !== state.activeProfileId) {
        throw new Error("PROJECT_BELONGS_TO_OTHER_PROFILE");
      }
      if (!existingOwner) {
        state.projectOwners[id] = state.activeProfileId;
        changed = true;
      }
    }
    if (changed) await writeState(state);
    return publicSnapshot(state, session);
  });
}

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") throw new Error("INVALID_MESSAGE");
  switch (message.type) {
    case "GET_SNAPSHOT":
      return getSnapshot();
    case "CONFIGURE":
      return configure(message);
    case "UNLOCK":
      return unlock(message);
    case "LOCK":
      return lock();
    case "SET_RECOVERY_MODE":
      return setRecoveryMode(message);
    case "CLAIM_CONVERSATION":
      return claimConversations(message);
    case "CLAIM_CONVERSATIONS":
      return claimConversations(message);
    case "CLAIM_PROJECT":
    case "CLAIM_PROJECTS":
      return claimProjects(message);
    default:
      throw new Error("UNKNOWN_MESSAGE");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "UNAUTHORIZED" });
    return false;
  }
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "UNKNOWN_ERROR" }));
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "lock-duochat") lock().catch(() => undefined);
});
