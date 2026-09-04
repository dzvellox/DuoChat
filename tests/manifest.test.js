"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest 1.5.2 V3, local avec GitHub uniquement pour les mises à jour", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.5.2");
  assert.deepEqual(manifest.host_permissions, ["https://chatgpt.com/*", "https://claude.ai/*", "https://api.github.com/*"]);
  assert.equal(manifest.permissions.includes("idle"), true);
  assert.equal(manifest.permissions.includes("alarms"), true);
  assert.equal(manifest.background.service_worker, "background.js");
});

test("raccourcis de verrouillage, panic, profil et screenshot déclarés", () => {
  for (const id of ["lock-duochat","panic-duochat","profile-picker","screenshot-mode"]) {
    assert.ok(manifest.commands[id], id);
  }
});

test("tous les fichiers principaux existent", () => {
  const files = [manifest.background.service_worker,manifest.action.default_popup,"dashboard.html","dashboard.js","dashboard.css","secure-auth.html","secure-auth.js","secure-auth.css","vendor/duochat-qr.js","vendor/QR-LICENSE.txt",...manifest.content_scripts.flatMap((entry)=>[...entry.js,...entry.css]),...Object.values(manifest.icons)];
  for (const file of files) assert.equal(fs.existsSync(path.join(root,file)),true,`${file} doit exister`);
});

test("aucun eval ni chargement de script distant", () => {
  const scripts=["background.js","content.js","popup.js","core.js","i18n.js","dashboard.js","secure-auth.js","vendor/duochat-qr.js"];
  for (const file of scripts) {
    const source=fs.readFileSync(path.join(root,file),"utf8");
    assert.equal(/\beval\s*\(/.test(source),false,`${file}: eval interdit`);
    assert.equal(/<script[^>]+src=["']https?:\/\//i.test(source),false,`${file}: script distant interdit`);
  }
});
