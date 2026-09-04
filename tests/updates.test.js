"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");

test("GitHub updater is serverless, token-free and wired for unpacked installs",()=>{
  const manifest=JSON.parse(read("manifest.json"));
  assert.equal(manifest.version,"1.5.2");
  assert.ok(manifest.permissions.includes("downloads"));
  assert.ok(manifest.host_permissions.includes("https://api.github.com/*"));
  const bg=read("background.js");
  assert.match(bg,/dzvellox\/DuoChat/);
  assert.match(bg,/CHECK_GITHUB_UPDATE/);
  assert.match(bg,/DOWNLOAD_GITHUB_UPDATE/);
  assert.doesNotMatch(bg,/ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+/);
  const dash=read("dashboard.js");
  assert.match(dash,/github-update-download/);
  assert.match(dash,/updateChannel/);
  assert.ok(fs.existsSync(path.join(root,"Update-DuoChat.ps1")));
  const updater=read("Update-DuoChat.ps1");
  assert.match(updater,/Get-FileHash/);
  assert.match(updater,/sha256:/i);
  assert.match(updater,/Unsafe path traversal/);
});
