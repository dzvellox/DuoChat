"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const C=require(path.join(root,"core.js"));

test("les secrets de profil ne sont plus saisis dans le DOM ChatGPT/Claude",()=>{
  const content=read("content.js");
  assert.doesNotMatch(content,/type=["']password["']/i);
  assert.doesNotMatch(content,/window\.prompt\s*\(/);
  assert.doesNotMatch(content,/CONFIGURE_ADVANCED|AUTHORIZE_ENTITY|type:\s*["']UNLOCK["']/);
  assert.match(content,/OPEN_SECURE_AUTH/);
  assert.match(read("secure-auth.js"),/type:"UNLOCK"|type:\s*"UNLOCK"/);
  assert.match(read("secure-auth.html"),/secure-auth\.js/);
});

test("les messages venant du content script sont allowlistés et les snapshots sont minimisés",()=>{
  const bg=read("background.js");
  assert.match(bg,/CONTENT_ALLOWED_MESSAGES/);
  assert.match(bg,/CONTENT_ACTION_NOT_ALLOWED/);
  assert.match(bg,/redactSnapshotForContent/);
  assert.match(bg,/__duochat_foreign__/);
});

test("PBKDF2, URL d’entités et whitelist appliquent les règles renforcées",()=>{
  assert.ok(C.PBKDF2_ITERATIONS>=600000);
  assert.equal(C.sanitizeEntityUrl("javascript:alert(1)","conversation","chatgpt:12345678-abcd-ef00-1234-567890abcdef"),"");
  assert.equal(C.sanitizeEntityUrl("http://chatgpt.com/c/abc","conversation","chatgpt:12345678-abcd-ef00-1234-567890abcdef"),"");
  assert.equal(C.sanitizeEntityUrl("https://chatgpt.com/","conversation","chatgpt:12345678-abcd-ef00-1234-567890abcdef"),"");
  assert.equal(C.sanitizeEntityUrl("https://chatgpt.com/c/12345678-abcd-ef00-1234-567890abcdef","conversation","chatgpt:12345678-abcd-ef00-1234-567890abcdef"),"https://chatgpt.com/c/12345678-abcd-ef00-1234-567890abcdef");
  assert.equal(C.normalizeDomain("com"),"");
  assert.equal(C.isDomainAllowed("http://example.com/x",["example.com"]),false);
  assert.equal(C.isDomainAllowed("https://sub.example.com/x",["example.com"]),true);
});

test("CSP stricte, permissions minimales et aucun host github.com inutile",()=>{
  const manifest=JSON.parse(read("manifest.json"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("object-src 'none'"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src https://api.github.com"));
  assert.equal(manifest.host_permissions.includes("https://github.com/*"),false);
});

test("support DuoChat utilise GitHub Sponsors sans token embarqué",()=>{
  const bg=read("background.js"), popup=read("popup.html"), dash=read("dashboard.js");
  assert.match(bg,/OPEN_SUPPORT/);
  assert.doesNotMatch(bg,/ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+/);
  assert.match(popup,/support-duochat/);
  assert.match(dash,/support-duochat-dashboard/);
  assert.equal(fs.existsSync(path.join(root,".github","FUNDING.yml")),true);
});

test("les URLs du dashboard sont resanitisées avant href",()=>{
  const dash=read("dashboard.js");
  assert.match(dash,/sanitizeEntityUrl/);
  assert.match(dash,/rel="noopener noreferrer"/);
});
