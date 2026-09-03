"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

test("extrait les identifiants de conversations ChatGPT", () => {
  assert.equal(
    C.extractConversationId("https://chatgpt.com/c/12345678-abcd-ef00-1234-567890abcdef"),
    "chatgpt:12345678-abcd-ef00-1234-567890abcdef"
  );
  assert.equal(
    C.extractConversationId("https://chatgpt.com/g/g-demo/c/abcdef123456"),
    "chatgpt:abcdef123456"
  );
  assert.equal(C.extractConversationId("https://example.com/c/abcdef123456"), null);
  assert.equal(C.extractConversationId("https://chatgpt.com/"), null);
});

test("extrait les identifiants de projets ChatGPT", () => {
  assert.equal(
    C.extractProjectId("https://chatgpt.com/g/g-p-abcdef123456/project"),
    "chatgpt:abcdef123456"
  );
  assert.equal(
    C.extractProjectId("https://chatgpt.com/projects/abcdef123456"),
    "chatgpt:abcdef123456"
  );
  assert.equal(
    C.extractProjectId("https://chatgpt.com/c/abcdef123456?project_id=g-p-project987654"),
    "chatgpt:project987654"
  );
  assert.equal(C.extractProjectId("https://chatgpt.com/g/g-demo/c/abcdef123456"), null);
});

test("extrait les conversations et projets Claude", () => {
  assert.equal(
    C.extractConversationId("https://claude.ai/chat/12345678-abcd-ef00-1234-567890abcdef"),
    "claude:12345678-abcd-ef00-1234-567890abcdef"
  );
  assert.equal(
    C.extractProjectId("https://claude.ai/project/project123456/chat/chat987654"),
    "claude:project123456"
  );
  assert.equal(
    C.extractConversationId("https://claude.ai/project/project123456/chat/chat987654"),
    "claude:chat987654"
  );
  assert.equal(C.extractProjectId("https://claude.ai/projects"), null);
});

test("isole les mêmes identifiants entre ChatGPT et Claude", () => {
  const rawId = "12345678-abcd-ef00-1234-567890abcdef";
  assert.notEqual(
    C.extractConversationId(`https://chatgpt.com/c/${rawId}`),
    C.extractConversationId(`https://claude.ai/chat/${rawId}`)
  );
  assert.equal(C.getSupportedSite("https://claude.ai/new").name, "Claude");
  assert.equal(C.getSupportedSite("https://example.com/"), null);
});

test("reconnaît le même projet avant et après l’ouverture d’un chat", () => {
  const projectPage = "https://chatgpt.com/g/g-p-abcdef123456/project";
  const projectChat = "https://chatgpt.com/c/chat987654?project_id=abcdef123456";
  const projectOwners = { [C.extractProjectId(projectPage)]: "A" };
  assert.equal(C.extractProjectId(projectPage), C.extractProjectId(projectChat));
  assert.equal(projectOwners[C.extractProjectId(projectChat)], "A");
});

test("nettoie les noms de profils", () => {
  assert.equal(C.sanitizeName("  Younes   A  ", "Utilisateur A"), "Younes A");
  assert.equal(C.sanitizeName("", "Utilisateur B"), "Utilisateur B");
  assert.equal(C.sanitizeName("x".repeat(50), "A").length, 30);
});

test("crée et vérifie des empreintes de mots de passe distinctes", async () => {
  const first = await C.createCredential("secret-A");
  const second = await C.createCredential("secret-A");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await C.verifyCredential("secret-A", first), true);
  assert.equal(await C.verifyCredential("secret-B", first), false);
});

test("normalise les propriétaires de conversations", () => {
  const state = C.normalizeState({
    configured: true,
    activeProfileId: "A",
    profiles: {
      A: { name: "A", credential: { algorithm: "PBKDF2-SHA256" } },
      B: { name: "B", credential: { algorithm: "PBKDF2-SHA256" } }
    },
    conversationOwners: {
      abcdef123: "A",
      invalid: "C",
      "not valid!": "B"
    },
    projectOwners: {
      "g-p-project123": "B",
      "bad id": "A",
      "g-p-wrongowner": "C"
    }
  });
  assert.equal(state.configured, true);
  assert.equal(state.version, 5);
  assert.deepEqual(state.profileOrder, ["A", "B"]);
  assert.deepEqual(state.conversationOwners, { "chatgpt:abcdef123": "A" });
  assert.deepEqual(state.projectOwners, { "chatgpt:project123": "B" });
});

test("accepte un nombre dynamique de profils", () => {
  const state = C.normalizeState({
    configured: true,
    activeProfileId: "profile-charlie",
    profiles: {
      A: { name: "Alice", credential: { algorithm: "PBKDF2-SHA256" } },
      B: { name: "Bob", credential: { algorithm: "PBKDF2-SHA256" } },
      "profile-charlie": { name: "Charlie", credential: { algorithm: "PBKDF2-SHA256" } }
    },
    profileOrder: ["profile-charlie", "A", "B"]
  });
  assert.equal(state.configured, true);
  assert.equal(state.activeProfileId, "profile-charlie");
  assert.deepEqual(state.profileOrder, ["profile-charlie", "A", "B"]);
  const generated = C.createProfileId(state.profiles);
  assert.equal(C.isValidProfileId(generated), true);
  assert.equal(state.profiles[generated], undefined);
});

test("exporte et importe un code de transfert sans contenu de conversation", () => {
  const state = C.normalizeState({
    configured: true,
    activeProfileId: "A",
    profiles: {
      A: { name: "Alice", credential: { algorithm: "PBKDF2-SHA256", hash: "hash-a" } },
      B: { name: "Bob", credential: { algorithm: "PBKDF2-SHA256", hash: "hash-b" } }
    },
    profileOrder: ["A", "B"],
    conversationOwners: { "chatgpt:conversation123": "A" },
    projectOwners: { "claude:project123": "B" }
  });
  const code = C.stateToTransferCode(state);
  const imported = C.transferCodeToState(code);
  assert.equal(code.startsWith("DUOCHAT1."), true);
  assert.deepEqual(imported.profileOrder, ["A", "B"]);
  assert.deepEqual(imported.conversationOwners, state.conversationOwners);
  assert.deepEqual(imported.projectOwners, state.projectOwners);
  assert.throws(() => C.transferCodeToState("code-invalide"), /INVALID_TRANSFER_CODE/);
});

test("fusionne les profils et conserve les attributions locales en cas de conflit", () => {
  const credential = { algorithm: "PBKDF2-SHA256", hash: "hash" };
  const local = {
    configured: true,
    activeProfileId: "A",
    profiles: { A: { name: "A", credential }, B: { name: "B", credential } },
    profileOrder: ["A", "B"],
    conversationOwners: { "chatgpt:conversation123": "A" }
  };
  const imported = {
    configured: true,
    activeProfileId: "B",
    profiles: {
      A: { name: "A", credential },
      B: { name: "B", credential },
      C: { name: "C", credential }
    },
    profileOrder: ["A", "B", "C"],
    conversationOwners: {
      "chatgpt:conversation123": "B",
      "claude:conversation456": "C"
    }
  };
  const result = C.mergeStates(local, imported);
  assert.deepEqual(result.state.profileOrder, ["A", "B", "C"]);
  assert.equal(result.state.conversationOwners["chatgpt:conversation123"], "A");
  assert.equal(result.state.conversationOwners["claude:conversation456"], "C");
  assert.equal(result.importedProfiles, 1);
  assert.equal(result.importedEntities, 1);
  assert.equal(result.conflicts, 1);
});

test("conserve les attributions Claude et migre les anciennes clés vers ChatGPT", () => {
  const state = C.normalizeState({
    configured: true,
    activeProfileId: "B",
    profiles: {
      A: { name: "A", credential: { algorithm: "PBKDF2-SHA256" } },
      B: { name: "B", credential: { algorithm: "PBKDF2-SHA256" } }
    },
    conversationOwners: {
      legacychat123: "A",
      "claude:claudechat123": "B"
    },
    projectOwners: {
      "g-p-legacyproject123": "A",
      "claude:claudeproject123": "B"
    }
  });
  assert.deepEqual(state.conversationOwners, {
    "chatgpt:legacychat123": "A",
    "claude:claudechat123": "B"
  });
  assert.deepEqual(state.projectOwners, {
    "chatgpt:legacyproject123": "A",
    "claude:claudeproject123": "B"
  });
});
