"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../i18n.js");

test("les six langues de l’interface sont disponibles", () => {
  assert.deepEqual(I.SUPPORTED_LANGUAGES.map((item) => item.id), ["fr", "en", "es", "de", "it", "pt"]);
  assert.equal(I.normalizeLanguage("fr-FR"), "fr");
  assert.equal(I.normalizeLanguage("de-DE"), "de");
  assert.equal(I.normalizeLanguage("xx"), null);
});

test("les écrans principaux sont traduits dans chaque langue", () => {
  for (const lang of ["fr", "en", "es", "de", "it", "pt"]) {
    assert.notEqual(I.t(lang, "settingsTitle"), "settingsTitle");
    assert.notEqual(I.t(lang, "protectedProjectTitle"), "protectedProjectTitle");
    assert.notEqual(I.t(lang, "recoveryRemovedHelp"), "recoveryRemovedHelp");
  }
  assert.equal(I.t("en", "passwordOf", { name: "Alice" }), "Password for Alice");
  assert.equal(I.t("es", "assignTo", { owner: "Ana" }), "Asignar a Ana");
});
