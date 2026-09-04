"use strict";

(function runPopup() {
  const C = globalThis.DuoChatCore;
  const I = globalThis.DuoChatI18n;
  const views = {
    loading: document.getElementById("loading-view"),
    language: document.getElementById("language-view"),
    setup: document.getElementById("setup-view"),
    locked: document.getElementById("locked-view"),
    unlocked: document.getElementById("unlocked-view"),
    settings: document.getElementById("settings-view")
  };
  const statusPill = document.getElementById("status-pill");
  const settingsButton = document.getElementById("open-settings");
  let snapshot = null;
  let language = null;
  let pendingFirstLanguage = "fr";
  let selectedProfileId = null;
  let switchTargetId = null;
  let currentView = "loading";

  function t(key, vars) {
    return I.t(language || pendingFirstLanguage || "fr", key, vars);
  }

  function hasActivePermission(permission) {
    const permissions = snapshot && snapshot.activeSettings && Array.isArray(snapshot.activeSettings.permissions) ? snapshot.activeSettings.permissions : [];
    return permissions.includes("admin") || permissions.includes(permission);
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || "EXTENSION_UNAVAILABLE"));
          return;
        }
        resolve(response.data);
      });
    });
  }



  async function refreshPopupUpdate(force=false) {
    const statusEl=document.getElementById("popup-update-status");
    const downloadEl=document.getElementById("popup-update-download");
    const versionEl=document.getElementById("popup-version-label");
    if (!statusEl) return;
    if (versionEl) versionEl.textContent=`v${chrome.runtime.getManifest().version}`;
    statusEl.textContent=t("updatesChecking");
    try {
      const status=await send({type:force?"CHECK_GITHUB_UPDATE":"GET_UPDATE_STATUS"});
      if (status.error) statusEl.textContent=`${t("errorGeneric")} (${status.error})`;
      else if (status.updateAvailable) statusEl.textContent=t("updatesAvailable",{version:status.latestVersion});
      else statusEl.textContent=t("updatesCurrent");
      if (downloadEl) downloadEl.hidden=!status.updateAvailable || !status.assetUrl;
    } catch (error) {
      statusEl.textContent=t("errorGeneric");
      if (downloadEl) downloadEl.hidden=true;
    }
  }

  function bytesToBase64Url(bytes) {
    return C.bytesToBase64Url(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  }

  async function createWebauthnAssertion(profileId) {
    if (!navigator.credentials || typeof navigator.credentials.get !== "function") throw new Error("WEBAUTHN_UNAVAILABLE");
    const begin = await send({ type: "BEGIN_WEBAUTHN_AUTHENTICATION", profileId });
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: C.base64UrlToBytes(begin.challenge),
        allowCredentials: [{ type: "public-key", id: C.base64UrlToBytes(begin.credentialId) }],
        userVerification: "required",
        timeout: 60000
      }
    });
    if (!credential || !credential.response) throw new Error("WEBAUTHN_CANCELLED");
    return {
      credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
      clientDataJSON: bytesToBase64Url(new Uint8Array(credential.response.clientDataJSON)),
      authenticatorData: bytesToBase64Url(new Uint8Array(credential.response.authenticatorData)),
      signature: bytesToBase64Url(new Uint8Array(credential.response.signature)),
      userHandle: credential.response.userHandle ? bytesToBase64Url(new Uint8Array(credential.response.userHandle)) : null
    };
  }

  async function registerWebauthn() {
    if (!navigator.credentials || typeof navigator.credentials.create !== "function") throw new Error("WEBAUTHN_UNAVAILABLE");
    const active = snapshot && snapshot.profiles && snapshot.profiles[snapshot.activeProfileId];
    if (!active) throw new Error("INVALID_PROFILE");
    const begin = await send({ type: "BEGIN_WEBAUTHN_REGISTRATION", profileId: active.id });
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: C.base64UrlToBytes(begin.challenge),
        rp: { name: "DuoChat" },
        user: { id: C.base64UrlToBytes(begin.userId), name: `duochat:${active.id}`, displayName: active.name },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { userVerification: "required", residentKey: "discouraged" },
        timeout: 60000,
        attestation: "none"
      }
    });
    if (!credential || !credential.response || typeof credential.response.getPublicKey !== "function") throw new Error("WEBAUTHN_PUBLIC_KEY_UNAVAILABLE");
    const publicKey = credential.response.getPublicKey();
    const algorithm = typeof credential.response.getPublicKeyAlgorithm === "function" ? credential.response.getPublicKeyAlgorithm() : -7;
    if (!publicKey || algorithm !== -7) throw new Error("UNSUPPORTED_WEBAUTHN_CREDENTIAL");
    snapshot = await send({
      type: "FINISH_WEBAUTHN_REGISTRATION",
      credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
      clientDataJSON: bytesToBase64Url(new Uint8Array(credential.response.clientDataJSON)),
      publicKeySpki: C.bytesToBase64(new Uint8Array(publicKey)),
      algorithm
    });
    return snapshot;
  }

  function renderWebauthnSettings() {
    const button = document.getElementById("webauthn-toggle");
    const status = document.getElementById("webauthn-status");
    if (!button || !status || !snapshot || !snapshot.unlocked) return;
    const active = snapshot.profiles[snapshot.activeProfileId];
    const enabled = Boolean(active && active.webauthnEnabled);
    button.textContent = t(enabled ? "webauthnDisable" : "webauthnEnable");
    status.textContent = t(enabled ? "webauthnEnabledHelp" : "webauthnOptionalHelp");
  }

  function renderTransferQr(code) {
    const box = document.getElementById("popup-transfer-qr");
    const help = document.getElementById("popup-transfer-qr-help");
    if (!box || !help || !globalThis.DuoChatQR) return;
    box.replaceChildren(); box.hidden = true;
    const size = new TextEncoder().encode(String(code || "")).length;
    if (!code) { help.textContent = ""; return; }
    if (size > globalThis.DuoChatQR.maxRecommendedBytes) {
      help.textContent = t("transferQrTooLarge");
      return;
    }
    try {
      globalThis.DuoChatQR.render(box, code, { size: 210, level: "L" });
      box.hidden = false;
      help.textContent = t("transferQrLocal");
    } catch (_error) {
      help.textContent = t("transferQrFailed");
    }
  }

  function showView(name) {
    currentView = name;
    for (const [key, element] of Object.entries(views)) element.hidden = key !== name;
    settingsButton.hidden = !(snapshot && snapshot.configured && snapshot.unlocked && name !== "settings" && hasActivePermission("access_settings"));
  }

  function applyLanguage() {
    I.applyToDocument(language || pendingFirstLanguage || "fr");
    buildLanguageList("first-language-list", pendingFirstLanguage, false);
    buildLanguageList("settings-language-list", language || pendingFirstLanguage, true);
  }

  function friendlyError(code) {
    if (code === "WRONG_PASSWORD") return t("errorWrongPassword");
    if (code === "PASSWORD_TOO_SHORT") return t("errorPasswordShort", { count: C.MIN_PASSWORD_LENGTH });
    if (code === "PROFILE_NAME_ALREADY_EXISTS") return t("errorDuplicateProfile");
    if (code === "INVALID_TRANSFER_CODE") return t("errorInvalidTransfer");
    if (code === "LOCKED") return t("errorLocked");
    if (code === "WEBAUTHN_REQUIRED") return t("webauthnRequired");
    if (code === "WEBAUTHN_UNAVAILABLE") return t("webauthnUnavailable");
    if (code && code.startsWith("WEBAUTHN_")) return t("webauthnFailed");
    if (code && code.startsWith("TEMPORARILY_BLOCKED:")) {
      return t("errorBlocked", { seconds: code.split(":")[1] });
    }
    return t("errorGeneric");
  }

  function profileInitial(profile) {
    const first = Array.from(profile.name.trim())[0];
    return first ? first.toLocaleUpperCase() : "U";
  }

  function createChevron() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m9 18 6-6-6-6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  function buildLanguageList(containerId, selected, saveImmediately) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();
    for (const item of I.SUPPORTED_LANGUAGES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "language-option";
      button.dataset.language = item.id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(item.id === selected));
      const code = document.createElement("span");
      code.className = "language-code";
      code.textContent = item.id.toUpperCase();
      const label = document.createElement("strong");
      label.textContent = item.nativeLabel;
      const check = document.createElement("span");
      check.className = "language-check";
      check.textContent = item.id === selected ? "✓" : "";
      button.append(code, label, check);
      button.addEventListener("click", async () => {
        if (!saveImmediately) {
          pendingFirstLanguage = item.id;
          I.applyToDocument(pendingFirstLanguage);
          buildLanguageList(containerId, pendingFirstLanguage, false);
          return;
        }
        if (item.id === language) return;
        button.disabled = true;
        try {
          const result = await send({ type: "SET_LANGUAGE", language: item.id });
          language = result.language;
          pendingFirstLanguage = language;
          applyLanguage();
        } catch (_error) {
          button.disabled = false;
        }
      });
      container.appendChild(button);
    }
  }

  function buildLockedProfiles() {
    const container = document.getElementById("locked-profiles");
    container.replaceChildren();
    selectedProfileId = snapshot.activeProfileId || snapshot.profileOrder[0];
    for (const id of snapshot.profileOrder) {
      const profile = snapshot.profiles[id];
      if (!profile) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-button";
      button.dataset.profile = id;
      button.setAttribute("aria-pressed", String(id === selectedProfileId));
      const avatar = document.createElement("span");
      avatar.className = "mini-avatar";
      avatar.textContent = profileInitial(profile);
      const name = document.createElement("strong");
      name.textContent = profile.name;
      const detail = document.createElement("span");
      detail.textContent = id === snapshot.activeProfileId ? t("lastUsed") : t("protectedProfile");
      button.append(avatar, name, detail);
      button.addEventListener("click", () => {
        selectedProfileId = id;
        for (const item of container.children) item.setAttribute("aria-pressed", String(item === button));
        document.getElementById("unlock-password").focus();
      });
      container.appendChild(button);
    }
  }

  function buildOtherProfiles() {
    const container = document.getElementById("other-profiles");
    const empty = document.getElementById("no-other-profiles");
    container.replaceChildren();
    const otherIds = snapshot.profileOrder.filter((id) => id !== snapshot.activeProfileId);
    empty.hidden = otherIds.length !== 0;
    for (const id of otherIds) {
      const profile = snapshot.profiles[id];
      if (!profile) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-row";
      const avatar = document.createElement("span");
      avatar.className = "avatar avatar-secondary";
      avatar.textContent = profileInitial(profile);
      const copy = document.createElement("span");
      copy.className = "profile-row-copy";
      const name = document.createElement("strong");
      name.textContent = profile.name;
      const detail = document.createElement("small");
      detail.textContent = t("passwordRequired");
      copy.append(name, detail);
      button.append(avatar, copy, createChevron());
      button.addEventListener("click", () => {
        switchTargetId = id;
        const form = document.getElementById("switch-form");
        document.getElementById("switch-label").textContent = t("passwordOf", { name: profile.name });
        form.hidden = false;
        requestAnimationFrame(() => form.elements.password.focus());
      });
      container.appendChild(button);
    }
  }

  function resetSettingsForms() {
    const form = document.getElementById("add-profile-form");
    form.hidden = true;
    form.reset();
    document.getElementById("show-add-profile").hidden = false;
    document.getElementById("add-profile-error").textContent = "";
  }

  function render() {
    applyLanguage();
    statusPill.classList.toggle("open", Boolean(snapshot && snapshot.unlocked));
    if (!language) {
      statusPill.textContent = t("languageChoose");
      showView("language");
      return;
    }
    if (!snapshot || !snapshot.configured) {
      statusPill.textContent = t("statusSetup");
      showView("setup");
      return;
    }
    if (!snapshot.unlocked) {
      statusPill.textContent = t("statusLocked");
      buildLockedProfiles();
      showView("locked");
      requestAnimationFrame(() => document.getElementById("unlock-password").focus());
      return;
    }
    statusPill.textContent = t("statusOpen");
    const active = snapshot.profiles[snapshot.activeProfileId];
    document.getElementById("current-avatar").textContent = profileInitial(active);
    document.getElementById("current-name").textContent = active.name;
    document.getElementById("switch-form").hidden = true;
    switchTargetId = null;
    buildOtherProfiles();
    showView("unlocked");
  }

  function showSettings() {
    if (!snapshot || !snapshot.configured || !snapshot.unlocked) return;
    resetSettingsForms();
    buildLanguageList("settings-language-list", language, true);
    statusPill.textContent = t("statusOpen");
    renderWebauthnSettings();
    showView("settings");
    refreshPopupUpdate(false);
  }

  async function importCode(code, feedbackElement) {
    feedbackElement.textContent = t("importing");
    try {
      const result = await send({ type: "IMPORT_TRANSFER_CODE", code });
      snapshot = result.snapshot;
      const summary = t("importSummary", { profiles: result.importedProfiles, entities: result.importedEntities });
      feedbackElement.textContent = result.conflicts
        ? t("importConflicts", { summary, conflicts: result.conflicts })
        : t("importDone", { summary });
      if (currentView !== "settings") render();
      return true;
    } catch (error) {
      feedbackElement.textContent = friendlyError(error.message);
      return false;
    }
  }

  document.getElementById("save-first-language").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await send({ type: "SET_LANGUAGE", language: pendingFirstLanguage });
      language = result.language;
      pendingFirstLanguage = language;
      render();
    } catch (_error) {
      button.disabled = false;
    }
  });

  document.getElementById("open-chatgpt").addEventListener("click", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));
  document.getElementById("open-claude").addEventListener("click", () => chrome.tabs.create({ url: "https://claude.ai/new" }));

  document.getElementById("setup-import").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const textarea = document.getElementById("setup-transfer-code");
    const feedback = document.getElementById("setup-import-error");
    button.disabled = true;
    const succeeded = await importCode(textarea.value, feedback);
    if (succeeded) textarea.value = "";
    button.disabled = false;
  });

  document.getElementById("unlock-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const error = document.getElementById("unlock-error");
    submit.disabled = true;
    error.textContent = "";
    try {
      const target = snapshot.profiles[selectedProfileId];
      const webauthnAssertion = target && target.webauthnEnabled ? await createWebauthnAssertion(selectedProfileId) : null;
      snapshot = await send({ type: "UNLOCK", profileId: selectedProfileId, password: form.elements.password.value, webauthnAssertion });
      form.reset();
      render();
    } catch (unlockError) {
      error.textContent = friendlyError(unlockError.message);
      submit.disabled = false;
      form.elements.password.select();
    }
  });

  document.getElementById("cancel-switch").addEventListener("click", () => {
    const form = document.getElementById("switch-form");
    form.reset();
    document.getElementById("switch-error").textContent = "";
    form.hidden = true;
    switchTargetId = null;
  });

  document.getElementById("switch-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const error = document.getElementById("switch-error");
    if (!switchTargetId || !snapshot.profiles[switchTargetId]) {
      error.textContent = t("chooseUser");
      return;
    }
    submit.disabled = true;
    error.textContent = "";
    try {
      const target = snapshot.profiles[switchTargetId];
      const webauthnAssertion = target && target.webauthnEnabled ? await createWebauthnAssertion(switchTargetId) : null;
      snapshot = await send({ type: "UNLOCK", profileId: switchTargetId, password: form.elements.password.value, webauthnAssertion });
      form.reset();
      submit.disabled = false;
      render();
    } catch (switchError) {
      error.textContent = friendlyError(switchError.message);
      submit.disabled = false;
      form.elements.password.select();
    }
  });

  settingsButton.addEventListener("click", showSettings);
  document.getElementById("settings-shortcut").addEventListener("click", showSettings);
  document.getElementById("dashboard-shortcut").addEventListener("click", () => send({ type: "OPEN_DASHBOARD_REQUEST" }).then(() => window.close()).catch(() => undefined));
  document.getElementById("back-settings").addEventListener("click", render);
  document.getElementById("open-secure-setup")?.addEventListener("click", async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { await send({ type: "OPEN_SECURE_AUTH", mode: "setup", conversationIds: [], projectIds: [] }); }
    catch (_error) { button.disabled = false; }
  });
  document.getElementById("support-duochat")?.addEventListener("click", async () => {
    try { await send({ type: "OPEN_SUPPORT" }); } catch (_error) {}
  });

  document.getElementById("popup-update-check")?.addEventListener("click",()=>refreshPopupUpdate(true));
  document.getElementById("popup-update-download")?.addEventListener("click",async()=>{try{await send({type:"DOWNLOAD_GITHUB_UPDATE"});}catch(error){console.error(error);}});


  document.getElementById("show-add-profile").addEventListener("click", () => {
    document.getElementById("show-add-profile").hidden = true;
    document.getElementById("add-profile-form").hidden = false;
    requestAnimationFrame(() => document.getElementById("new-profile-name").focus());
  });

  document.getElementById("cancel-add-profile").addEventListener("click", resetSettingsForms);

  document.getElementById("add-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.getElementById("add-profile-error");
    const submit = form.querySelector('[type="submit"]');
    error.textContent = "";
    if (form.elements.password.value !== form.elements.confirm.value) {
      error.textContent = t("confirmMismatch");
      form.elements.confirm.focus();
      return;
    }
    submit.disabled = true;
    try {
      snapshot = await send({ type: "ADD_PROFILE", name: form.elements.name.value, password: form.elements.password.value });
      form.reset();
      submit.disabled = false;
      resetSettingsForms();
    } catch (addError) {
      error.textContent = friendlyError(addError.message);
      submit.disabled = false;
    }
  });

  document.getElementById("export-code").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const textarea = document.getElementById("transfer-code");
    const status = document.getElementById("transfer-status");
    button.disabled = true;
    status.textContent = t("generating");
    try {
      const result = await send({ type: "EXPORT_TRANSFER_CODE" });
      textarea.value = result.code;
      renderTransferQr(result.code);
      status.textContent = t("generated");
      textarea.focus();
      textarea.select();
    } catch (error) {
      status.textContent = friendlyError(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("copy-code").addEventListener("click", async () => {
    const textarea = document.getElementById("transfer-code");
    const status = document.getElementById("transfer-status");
    if (!textarea.value.trim()) {
      status.textContent = t("needCode");
      return;
    }
    try {
      await navigator.clipboard.writeText(textarea.value.trim());
      status.textContent = t("copied");
    } catch (_error) {
      textarea.focus();
      textarea.select();
      status.textContent = t("selectedCopy");
    }
  });

  document.getElementById("import-code").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    await importCode(document.getElementById("transfer-code").value, document.getElementById("transfer-status"));
    button.disabled = false;
  });

  document.getElementById("webauthn-toggle")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const status = document.getElementById("webauthn-status");
    try {
      const active = snapshot.profiles[snapshot.activeProfileId];
      if (active && active.webauthnEnabled) snapshot = await send({ type: "DISABLE_WEBAUTHN" });
      else await registerWebauthn();
      renderWebauthnSettings();
    } catch (error) {
      status.textContent = friendlyError(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("lock-now").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      snapshot = await send({ type: "LOCK" });
      render();
    } catch (_error) {
      button.disabled = false;
    }
  });

  Promise.all([send({ type: "GET_SNAPSHOT" }), send({ type: "GET_LANGUAGE" })])
    .then(([state, languageResult]) => {
      snapshot = state;
      language = I.normalizeLanguage(languageResult.language);
      pendingFirstLanguage = language || I.normalizeLanguage(navigator.language) || "fr";
      render();
    })
    .catch(() => {
      language = "fr";
      applyLanguage();
      statusPill.textContent = t("statusError");
      showView("setup");
    });
})();
