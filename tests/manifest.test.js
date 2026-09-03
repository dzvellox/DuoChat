"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("le manifeste est une extension Manifest V3 limitée à ChatGPT et Claude", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.3.1");
  assert.deepEqual(manifest.host_permissions, ["https://chatgpt.com/*", "https://claude.ai/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://chatgpt.com/*",
    "https://claude.ai/*"
  ]);
  assert.equal(manifest.background.service_worker, "background.js");
});

test("tous les fichiers déclarés existent", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]),
    ...Object.values(manifest.icons)
  ];
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} doit exister`);
  }
});

test("aucun script distant ni eval n’est autorisé", () => {
  assert.equal(manifest.content_security_policy, undefined);
  const scripts = ["background.js", "content.js", "popup.js", "core.js"];
  for (const file of scripts) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(/\beval\s*\(/.test(source), false, `${file} ne doit pas utiliser eval`);
    const withoutAllowedSites = source
      .replaceAll("https://chatgpt.com", "")
      .replaceAll("https://claude.ai", "")
      .replaceAll("http://www.w3.org/2000/svg", "");
    assert.equal(/https?:\/\//.test(withoutAllowedSites), false, `${file} ne doit charger aucun service distant`);
  }
});
