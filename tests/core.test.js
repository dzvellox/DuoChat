"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

test("extrait les identifiants ChatGPT et Claude sans collision", () => {
  const raw = "12345678-abcd-ef00-1234-567890abcdef";
  assert.equal(C.extractConversationId(`https://chatgpt.com/c/${raw}`), `chatgpt:${raw}`);
  assert.equal(C.extractConversationId(`https://claude.ai/chat/${raw}`), `claude:${raw}`);
  assert.equal(C.extractProjectId("https://chatgpt.com/g/g-p-abcdef123456/project"), "chatgpt:abcdef123456");
  assert.equal(C.extractProjectId("https://claude.ai/project/project123456/chat/chat987654"), "claude:project123456");
  assert.equal(C.getSupportedSite("https://example.com/"), null);
});

test("reconnaît un projet ChatGPT dans l'URL d'une conversation", () => {
  assert.equal(
    C.extractProjectId("https://chatgpt.com/c/chat987654?project_id=abcdef123456"),
    "chatgpt:abcdef123456"
  );
});

test("nettoie les noms, tags et couleurs", () => {
  assert.equal(C.sanitizeName("  Younes   A  ", "Utilisateur A"), "Younes A");
  assert.equal(C.sanitizeName("x".repeat(80), "A").length, 40);
  assert.equal(C.sanitizeTag(" <Travail> "), "Travail");
  assert.equal(C.sanitizeColor("#12abEF"), "#12ABEF");
});

test("crée et vérifie des identifiants de profil et mots de passe", async () => {
  const id = C.createProfileId({ A: {}, B: {} });
  assert.equal(C.isValidProfileId(id), true);
  const first = await C.createCredential("123456");
  const second = await C.createCredential("123456");
  assert.notEqual(first.salt, second.salt);
  assert.equal(await C.verifyCredential("123456", first), true);
  assert.equal(await C.verifyCredential("654321", first), false);
});

test("migre un état 1.4 vers le coffre legacy 1.5", () => {
  const state = C.normalizeState({
    version: 5,
    configured: true,
    activeProfileId: "A",
    profiles: {
      A: { name: "Alice", credential: { algorithm: "PBKDF2-SHA256" } },
      B: { name: "Bob", credential: { algorithm: "PBKDF2-SHA256" } }
    },
    conversationOwners: { legacychat123: "A", "claude:claudechat123": "B", bad: "Z" },
    projectOwners: { "g-p-legacyproject123": "A", "claude:claudeproject123": "B" }
  });
  assert.equal(state.version, C.STATE_VERSION);
  assert.equal(state.encryption.enabled, false);
  assert.deepEqual(state.legacyVault.conversationOwners, {
    "chatgpt:legacychat123": "A",
    "claude:claudechat123": "B"
  });
  assert.deepEqual(state.legacyVault.projectOwners, {
    "chatgpt:legacyproject123": "A",
    "claude:claudeproject123": "B"
  });
});

test("normalise les réglages avancés par profil", () => {
  const profiles = {
    A: C.normalizeProfileHeader("A", { name:"Admin", role:"admin", template:"personal", accent:"#7667f5" }, 0),
    B: C.normalizeProfileHeader("B", { name:"Enfant", role:"child", template:"child", accent:"#22a06b" }, 1)
  };
  const vault = C.normalizeVault({ profileSettings: {
    A: { autoLockMinutes:0, theme:"dark", language:"fr", focusMode:{enabled:true,type:"favorites",value:""} },
    B: {}
  } }, profiles);
  assert.equal(vault.profileSettings.A.autoLockMinutes, 0);
  assert.equal(vault.profileSettings.A.theme, "dark");
  assert.equal(vault.profileSettings.A.focusMode.enabled, true);
  assert.equal(vault.profileSettings.B.simplified, true);
  assert.equal(vault.profileSettings.B.hiddenFunctions.includes("external_links"), true);
  assert.equal(vault.profileSettings.A.permissions.includes("admin"), true);
});

test("chiffre et déchiffre le coffre local en AES-GCM avec clé 256 bits", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const payload = { conversationOwners:{"chatgpt:abc123456":"A"}, note:"local only" };
  const encrypted = await C.encryptJsonWithRawKey(payload, key);
  assert.notEqual(encrypted.ciphertext.includes("local only"), true);
  assert.deepEqual(await C.decryptJsonWithRawKey(encrypted, key), payload);
});

test("enveloppe la clé du coffre avec un PIN/mot de passe et la récupère", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await C.wrapVaultKey(key, "123456");
  assert.deepEqual([...await C.unwrapVaultKey(wrapped, "123456")], [...key]);
  await assert.rejects(() => C.unwrapVaultKey(wrapped, "000000"));
});

test("exporte/import un code de transfert DuoChat2 sans script distant", () => {
  const state = C.normalizeState({
    version:C.STATE_VERSION, configured:true, activeProfileId:"A",
    profiles:{
      A:{name:"A",credential:{algorithm:"PBKDF2-SHA256",iterations:C.PBKDF2_ITERATIONS,salt:"AA==",hash:"AA=="}},
      B:{name:"B",credential:{algorithm:"PBKDF2-SHA256",iterations:C.PBKDF2_ITERATIONS,salt:"AA==",hash:"AA=="}}
    }, profileOrder:["A","B"],
    encryption:{enabled:true,encryptedVault:{v:1,iv:"AA==",ciphertext:"AA=="},recoveryWrap:{v:1}}
  });
  const code = C.transferCodeFromState(state);
  assert.equal(code.startsWith("DUOCHAT2."), true);
  const imported = C.transferCodeToState(code);
  assert.deepEqual(imported.profileOrder, ["A","B"]);
  assert.throws(() => C.transferCodeToState("bad"), /INVALID_TRANSFER_CODE/);
});

test("exporte/import un fichier portable .duochat chiffré", async () => {
  const bundle = { format:"duochat-portable-1", state:{version:C.STATE_VERSION}, secret:"hello" };
  const encrypted = await C.encryptPortableBundle(bundle, "motdepasse");
  assert.equal(encrypted.includes("hello"), false);
  assert.deepEqual(await C.decryptPortableBundle(encrypted, "motdepasse"), bundle);
  await assert.rejects(() => C.decryptPortableBundle(encrypted, "mauvais"));
});

test("gère les profils temporaires, planning et whitelist", () => {
  const temp = C.normalizeTemporary({ mode:"hours", expiresAt:123456789, expired:true });
  assert.deepEqual(temp, { mode:"hours", expiresAt:123456789, expired:true });
  assert.equal(C.isScheduleAllowed({enabled:false}, new Date()), true);
  assert.equal(C.isDomainAllowed("https://docs.example.com/a", ["example.com"]), true);
  assert.equal(C.isDomainAllowed("https://evil.test/", ["example.com"]), false);
});

test("les métadonnées locales supportent favoris, tags, alias, notes et verrou supplémentaire", () => {
  const profiles={A:C.normalizeProfileHeader("A",{name:"A"},0)};
  const vault=C.normalizeVault({
    conversationOwners:{"chatgpt:abc123456":"A"},
    conversationMeta:{"chatgpt:abc123456":{title:"Titre",alias:"Alias",favorite:true,extraLock:true,tags:["Travail","Urgent"],folder:"Client",note:"note locale"}}
  },profiles);
  const meta=vault.conversationMeta["chatgpt:abc123456"];
  assert.equal(meta.favorite,true);
  assert.equal(meta.extraLock,true);
  assert.deepEqual(meta.tags,["Travail","Urgent"]);
  assert.equal(meta.note,"note locale");
});


test("normalise les raccourcis personnalisables et l’état WebAuthn public", () => {
  const credential={algorithm:"PBKDF2-SHA256",iterations:C.PBKDF2_ITERATIONS,salt:"AA==",hash:"AA=="};
  const profile=C.normalizeProfileHeader("A",{name:"A",credential,webauthn:{enabled:true,credentialId:"cred",publicKeySpki:"pub",algorithm:-7}},0);
  const vault=C.normalizeVault({profileSettings:{A:{shortcuts:{palette:"Alt+P",panic:"Ctrl+Shift+X",lock:"Alt+L"}}}},{A:profile});
  assert.equal(vault.profileSettings.A.shortcuts.palette,"Alt+P");
  assert.equal(vault.profileSettings.A.shortcuts.panic,"Ctrl+Shift+X");
  assert.equal(C.profilePublic(profile).webauthnEnabled,true);
});
