"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const content=fs.readFileSync(path.join(root,"content.js"),"utf8");
const background=fs.readFileSync(path.join(root,"background.js"),"utf8");
const popup=fs.readFileSync(path.join(root,"popup.html"),"utf8");

test("le bouton de récupération global dangereux reste supprimé",()=>{
  assert.equal(popup.includes('id="recovery-toggle"'),false);
  assert.equal(content.includes("snapshot.recoveryMode"),false);
  assert.match(background,/case "SET_RECOVERY_MODE": return getSnapshot\(\)/);
});

test("les changements d'URL, liens directs et historique repassent par le guard",()=>{
  assert.match(content,/history\.pushState/);
  assert.match(content,/history\.replaceState/);
  assert.match(content,/popstate/);
  assert.match(content,/setInterval\(handlePotentialNavigation, 350\)/);
  assert.match(content,/showBlocked\(projectOwner, "project"\)/);
  assert.match(content,/showBlocked\(conversationOwner, "conversation"\)/);
});

test("l'attribution d'un projet inclut les conversations sans voler celles d'un autre profil",()=>{
  assert.match(content,/CLAIM_PROJECT_WITH_CONVERSATIONS/);
  assert.match(background,/async function claimProjectAndConversations/);
  assert.match(background,/Never steal an already assigned conversation/);
});

test("AES, verrou supplémentaire, panic et synchronisation multi-onglets sont câblés",()=>{
  assert.match(background,/wrapVaultKey/);
  assert.match(background,/AUTHORIZE_ENTITY/);
  assert.match(background,/PANIC_LOCK/);
  assert.match(background,/chrome\.tabs\.query/);
  assert.match(background,/chrome\.idle\.onStateChanged/);
});

test("auto-attribution, règles, Smart Migration, backups et bulk assign sont présents",()=>{
  for (const marker of ["AUTO_ASSIGN_ENTITY","ADD_RULE","SMART_MIGRATION","SMART_MIGRATION_APPLY","RESTORE_BACKUP","BULK_ASSIGN"]) assert.match(background,new RegExp(marker));
});

test("WebAuthn / Windows Hello est câblé comme second facteur local",()=>{
  const popupJs=fs.readFileSync(path.join(root,"popup.js"),"utf8");
  const dashboardJs=fs.readFileSync(path.join(root,"dashboard.js"),"utf8");
  for (const marker of ["BEGIN_WEBAUTHN_REGISTRATION","FINISH_WEBAUTHN_REGISTRATION","BEGIN_WEBAUTHN_AUTHENTICATION","DISABLE_WEBAUTHN"]) assert.match(background,new RegExp(marker));
  assert.match(popupJs,/navigator\.credentials\.create/);
  assert.match(popupJs,/navigator\.credentials\.get/);
  assert.match(dashboardJs,/navigator\.credentials\.create/);
});

test("Safe Links retire l’URL sensible lorsqu’un accès est refusé",()=>{
  assert.match(content,/duochat_access_denied/);
  assert.match(content,/originalReplaceState\(\{\}, "", deniedUrl\)/);
  assert.match(content,/safeAccessDeniedUrl/);
});

test("le PIN supplémentaire utilise un identifiant séparé du profil",()=>{
  assert.match(background,/SET_ENTITY_LOCK/);
  assert.match(background,/extraLockCredential/);
  assert.match(background,/const credential = meta\.extraLockCredential \|\| profile\.credential/);
  assert.match(background,/verifyCredential\(message\.password, credential\)/);
});

test("les raccourcis personnalisables et l’attribution initiale multi-profils sont câblés",()=>{
  assert.match(content,/shortcutMatches/);
  assert.match(content,/firstProfileIndex/);
  assert.match(background,/firstProfileIndex/);
});

test("le transfert QR est local, chiffré et peut être découpé en plusieurs QR",()=>{
  const dashboardJs=fs.readFileSync(path.join(root,"dashboard.js"),"utf8");
  const qr=fs.readFileSync(path.join(root,"vendor","duochat-qr.js"),"utf8");
  assert.match(dashboardJs,/DUOCHATQR1\|/);
  assert.match(dashboardJs,/EXPORT_DUOCHAT_FILE/);
  assert.match(dashboardJs,/parseEncryptedQrChunks/);
  assert.match(qr,/DuoChatQR/);
  assert.equal(/fetch\s*\(|importScripts\s*\(|<script[^>]+src=["\']https?:\/\//i.test(qr),false);
});
