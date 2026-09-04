"use strict";

document.documentElement.classList.add("duochat-pending");

(function runDuoChatGuard() {
  const C = globalThis.DuoChatCore;
  const I = globalThis.DuoChatI18n;
  let language = null;
  const currentSite = C.getSupportedSite(location.href);
  const siteName = currentSite ? currentSite.name : "ce service";
  const homeUrl = currentSite ? currentSite.homeUrl : location.origin;
  let snapshot = null;
  let currentUrl = location.href;
  let previousConversationId = C.extractConversationId(currentUrl);
  let previousProjectId = C.extractProjectId(currentUrl);
  let routeEvaluationCount = 0;
  let observer = null;
  let projectChatClaimInFlight = false;
  let titleShieldActive = true;
  let protectedTitle = "DuoChat";
  let pendingPageTitle = "";
  let pendingPageTitleUrl = "";
  let lastActivitySentAt = 0;
  let paletteOpen = false;
  let metadataSyncTimer = null;


  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function activeSettings() {
    return snapshot && snapshot.activeSettings ? snapshot.activeSettings : {};
  }

  function hasPermission(permission) {
    const permissions = Array.isArray(activeSettings().permissions) ? activeSettings().permissions : [];
    return permissions.includes("admin") || permissions.includes(permission);
  }

  function sendActivity() {
    const now = Date.now();
    if (now - lastActivitySentAt < 15000) return;
    lastActivitySentAt = now;
    send({ type: "USER_ACTIVITY" }).catch(() => undefined);
  }

  function metaFor(kind, id) {
    if (!snapshot || !id) return null;
    return kind === "project" ? snapshot.projectMeta[id] : snapshot.conversationMeta[id];
  }

  function profileAccent() {
    const profile = snapshot && snapshot.profiles && snapshot.profiles[snapshot.activeProfileId];
    return (activeSettings().accent || (profile && profile.accent) || "#7667F5");
  }

  function applyVisualProtection() {
    if (!snapshot || !snapshot.unlocked) return;
    const root = document.documentElement;
    const settings = activeSettings();
    root.style.setProperty("--duochat-accent", profileAccent());
    root.dataset.duochatTheme = ["light", "dark"].includes(settings.theme) ? settings.theme : "system";
    root.style.colorScheme = settings.theme === "dark" ? "dark" : settings.theme === "light" ? "light" : "light dark";
    root.classList.toggle("duochat-privacy-blur", settings.privacyBlur === true);
    root.classList.toggle("duochat-presentation", snapshot.presentationMode === true);
    root.classList.toggle("duochat-screenshot", snapshot.screenshotMode === true);
    root.classList.toggle("duochat-simplified", settings.simplified === true);
  }

  function isSensitiveAuthorized(entityId) {
    return snapshot && Array.isArray(snapshot.authorizedSensitiveIds) && snapshot.authorizedSensitiveIds.includes(entityId);
  }

  function showSensitiveChallenge(entityId, entityType) {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle(t("verifyingTitle"));
    const panel = gateShell(t("extraAccessTitle"), t("extraAccessLead"));
    const form = document.createElement("form");
    form.className = "duochat-form";
    form.innerHTML = `<div class="duochat-field"><label>${escapeHtml(t("extraPasswordLabel"))}</label><input name="password" type="password" autocomplete="current-password" required></div><p class="duochat-error" role="alert"></p><div class="duochat-actions"><button class="duochat-button duochat-button-primary" type="submit">${escapeHtml(t("extraUnlock10"))}</button><button class="duochat-button duochat-button-secondary" type="button" data-cancel>${escapeHtml(t("back"))}</button></div>`;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        snapshot = await send({ type: "AUTHORIZE_ENTITY", entityId, password: form.elements.password.value });
        await evaluateRoute(true);
      } catch (error) {
        form.querySelector(".duochat-error").textContent = friendlyError(error.message);
        submit.disabled = false;
        form.elements.password.select();
      }
    });
    form.querySelector("[data-cancel]").addEventListener("click", () => location.assign(homeUrl));
    panel.appendChild(form);
    requestAnimationFrame(() => form.elements.password.focus());
  }

  function featureSelectors(feature) {
    const map = {
      apps: ['a[href*="/apps"]', 'a[href*="/connectors"]'],
      gpts: ['a[href*="/gpts"]', 'a[href*="/g/"]'],
      settings: ['a[href*="/settings"]', 'button[aria-label*="Settings" i]', 'button[aria-label*="Param" i]'],
      share: ['button[aria-label*="Share" i]', 'button[aria-label*="Partager" i]'],
      files: ['button[aria-label*="file" i]', 'button[aria-label*="fichier" i]', 'input[type="file"]'],
      projects_create: ['button[aria-label*="project" i]', 'button[aria-label*="projet" i]']
    };
    return map[feature] || [];
  }

  function applyFunctionRestrictions() {
    if (!snapshot || !snapshot.unlocked) return;
    for (const node of document.querySelectorAll('[data-duochat-function-hidden="true"]')) {
      node.removeAttribute("data-duochat-function-hidden");
    }
    const hidden = new Set(Array.isArray(activeSettings().hiddenFunctions) ? activeSettings().hiddenFunctions : []);
    if (!hasPermission("access_settings")) hidden.add("settings");
    if (!hasPermission("create_projects")) hidden.add("projects_create");
    if (!hasPermission("export_own")) hidden.add("share");
    for (const feature of hidden) {
      for (const selector of featureSelectors(feature)) {
        for (const element of document.querySelectorAll(selector)) element.setAttribute("data-duochat-function-hidden", "true");
      }
    }
  }

  function focusAllows(kind, id, meta) {
    const focus = activeSettings().focusMode;
    if (!focus || focus.enabled !== true) return true;
    if (kind === "project" && focus.type === "project") return id === focus.value;
    if (kind !== "conversation") return focus.type !== "project";
    if (focus.type === "project") return meta && meta.projectId === focus.value;
    if (focus.type === "tag") return meta && Array.isArray(meta.tags) && meta.tags.includes(focus.value);
    if (focus.type === "folder") return meta && meta.folder === focus.value;
    if (focus.type === "favorites") return meta && meta.favorite === true;
    return true;
  }

  function syncVisibleMetadata() {
    if (!snapshot || !snapshot.unlocked || metadataSyncTimer) return;
    metadataSyncTimer = setTimeout(() => {
      metadataSyncTimer = null;
      const tasks = [];
      for (const link of document.querySelectorAll('a[href][data-duochat-allowed="true"]')) {
        const conversationId = C.extractConversationId(link.href);
        const projectId = C.extractProjectId(link.href);
        const kind = projectId ? "project" : (conversationId ? "conversation" : null);
        const id = projectId || conversationId;
        if (!kind || !id) continue;
        const label = (link.getAttribute("aria-label") || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
        if (!label) continue;
        const known = metaFor(kind, id);
        if (known && known.title === label && known.url === link.href) continue;
        tasks.push(send({ type: "UPSERT_ENTITY_META", entityType: kind, entityId: id, patch: { title: label, url: link.href, lastSeenAt: Date.now() } }).catch(() => undefined));
        if (tasks.length >= 20) break;
      }
      if (tasks.length) Promise.allSettled(tasks).then(() => undefined);
    }, 800);
  }

  function showExternalBlocked(url) {
    const panel = gateShell(t("externalBlockedTitle"), t("externalBlockedLead", { domain: new URL(url).hostname }));
    const actions = document.createElement("div");
    actions.className = "duochat-actions";
    const back = document.createElement("button");
    back.className = "duochat-button duochat-button-primary";
    back.textContent = t("close");
    back.addEventListener("click", () => { document.getElementById("duochat-gate")?.remove(); document.documentElement.classList.remove("duochat-pending"); });
    actions.appendChild(back);
    panel.appendChild(actions);
  }

  function closeCommandPalette() {
    document.getElementById("duochat-command-palette")?.remove();
    paletteOpen = false;
  }

  function openCommandPalette() {
    if (!snapshot || !snapshot.unlocked || paletteOpen) return;
    paletteOpen = true;
    const overlay = document.createElement("div");
    overlay.id = "duochat-command-palette";
    overlay.innerHTML = `<div class="duochat-command-box"><input type="search" placeholder="${escapeHtml(t("commandPlaceholder"))}" autocomplete="off"><div class="duochat-command-results"></div></div>`;
    document.documentElement.appendChild(overlay);
    const input = overlay.querySelector("input");
    const results = overlay.querySelector(".duochat-command-results");
    const render = () => {
      const query = input.value.trim().toLowerCase();
      const commands = [
        { label: t("commandLock"), run: () => send({ type: "LOCK" }) },
        { label: "Panic Lock", run: () => send({ type: "PANIC_LOCK" }) },
        { label: t(snapshot.presentationMode ? "commandPresentationOff" : "commandPresentationOn"), run: () => send({ type: "SET_MODE", mode: "presentation", enabled: !snapshot.presentationMode }) },
        { label: t(snapshot.screenshotMode ? "commandScreenshotOff" : "commandScreenshotOn"), run: () => send({ type: "SET_MODE", mode: "screenshot", enabled: !snapshot.screenshotMode }) },
              ];
      if (hasPermission("access_settings")) commands.push({ label: t("commandDashboard"), run: () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD_REQUEST" }) });
      for (const id of snapshot.profileOrder) {
        if (id === snapshot.activeProfileId || !snapshot.profiles[id]) continue;
        commands.push({ label: t("commandSwitchProfile", { name: snapshot.profiles[id].name }), run: () => { closeCommandPalette(); showLogin(id); return Promise.resolve(); } });
      }
      for (const [id, meta] of Object.entries(snapshot.conversationMeta || {})) {
        const title = meta.alias || meta.title || id;
        commands.push({ label: `Chat: ${title}`, run: () => { if (meta.url) location.assign(meta.url); return Promise.resolve(); } });
      }
      const filtered = commands.filter((item) => !query || item.label.toLowerCase().includes(query)).slice(0, 12);
      results.replaceChildren();
      filtered.forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label;
        if (index === 0) button.dataset.active = "true";
        button.addEventListener("click", async () => {
          try { await item.run(); } catch (_error) {}
          closeCommandPalette();
        });
        results.appendChild(button);
      });
    };
    input.addEventListener("input", render);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeCommandPalette(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeCommandPalette(); }
      if (event.key === "Enter") { const first = results.querySelector("button"); if (first) first.click(); }
    });
    render();
    requestAnimationFrame(() => input.focus());
  }

  function t(key, vars) {
    return I.t(language || "fr", key, vars);
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

  function iconMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.25 20 5.4v5.86c0 5.05-3.38 9.31-8 10.49-4.62-1.18-8-5.44-8-10.49V5.4l8-3.15Zm-1.07 5.18a3.04 3.04 0 0 0-3.04 3.04v.48H7.4a1.2 1.2 0 0 0-1.2 1.2v4.06a1.2 1.2 0 0 0 1.2 1.2h9.2a1.2 1.2 0 0 0 1.2-1.2v-4.06a1.2 1.2 0 0 0-1.2-1.2h-.49v-.48a3.04 3.04 0 0 0-3.04-3.04h-2.14Zm0 1.55h2.14c.82 0 1.49.67 1.49 1.49v.48h-5.12v-.48c0-.82.67-1.49 1.49-1.49Z"/></svg>';
  }

  function gateShell(title, lead) {
    let gate = document.getElementById("duochat-gate");
    if (!gate) {
      gate = document.createElement("section");
      gate.id = "duochat-gate";
      gate.setAttribute("role", "dialog");
      gate.setAttribute("aria-modal", "true");
      document.documentElement.appendChild(gate);
    }
    gate.replaceChildren();
    const panel = document.createElement("div");
    panel.className = "duochat-panel";
    panel.innerHTML = `
      <div class="duochat-brand">
        <div class="duochat-logo">${iconMarkup()}</div>
        <div class="duochat-brand-copy"><strong>DuoChat</strong><span>${t("brandSubtitle")}</span></div>
      </div>
      <h1></h1>
      <p class="duochat-lead"></p>
    `;
    panel.querySelector("h1").textContent = title;
    panel.querySelector(".duochat-lead").textContent = lead;
    gate.appendChild(panel);
    return panel;
  }

  function shieldBrowserTitle(value) {
    titleShieldActive = true;
    protectedTitle = value;
    if (document.title && document.title !== protectedTitle) {
      pendingPageTitle = document.title;
      pendingPageTitleUrl = location.href;
    }
    if (document.title !== protectedTitle) document.title = protectedTitle;
  }

  function enforceTitleShield() {
    if (!titleShieldActive) return;
    if (document.title && document.title !== protectedTitle) {
      pendingPageTitle = document.title;
      pendingPageTitleUrl = location.href;
    }
    if (document.title !== protectedTitle) document.title = protectedTitle;
  }

  function removeGateAndReveal() {
    const gate = document.getElementById("duochat-gate");
    if (gate) gate.remove();
    titleShieldActive = false;
    if (pendingPageTitle && pendingPageTitleUrl === location.href) {
      document.title = pendingPageTitle;
    }
    pendingPageTitle = "";
    pendingPageTitleUrl = "";
    // Filter every protected/unassigned sidebar item before revealing the host page.
    applyVisualProtection();
    applyFunctionRestrictions();
    filterProtectedLinks();
    syncVisibleMetadata();
    document.documentElement.classList.remove("duochat-pending");
  }

  function friendlyError(code) {
    if (code === "WRONG_PASSWORD") return t("errorWrongPassword");
    if (code === "PASSWORD_TOO_SHORT") return t("errorPasswordShort", { count: C.MIN_PASSWORD_LENGTH });
    if (code && code.startsWith("TEMPORARILY_BLOCKED:")) {
      return t("errorBlocked", { seconds: code.split(":")[1] });
    }
    if (code === "CONVERSATION_BELONGS_TO_OTHER_PROFILE") return t("errorConversationOther");
    if (code === "PROJECT_BELONGS_TO_OTHER_PROFILE") return t("errorProjectOther");
    if (code === "WEBAUTHN_POPUP_REQUIRED" || code === "WEBAUTHN_REQUIRED") return t("webauthnPopupRequired");
    return t("errorGeneric");
  }

  function collectVisibleEntities() {
    const conversationIds = new Set();
    const projectIds = new Set();
    for (const link of document.querySelectorAll('a[href]')) {
      if (link.getClientRects().length === 0) continue;
      const conversationId = C.extractConversationId(link.href);
      const projectId = C.extractProjectId(link.href);
      if (conversationId) conversationIds.add(conversationId);
      if (projectId) projectIds.add(projectId);
    }
    return { conversationIds: [...conversationIds], projectIds: [...projectIds] };
  }

  function showLanguageChooser() {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle("DuoChat");
    const guessed = I.normalizeLanguage(navigator.language) || "fr";
    let selected = guessed;
    language = selected;
    const panel = gateShell(t("languageWelcomeTitle"), t("languageWelcomeLead"));
    const list = document.createElement("div");
    list.className = "duochat-language-list";
    list.setAttribute("role", "radiogroup");
    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "duochat-button duochat-button-primary duochat-language-continue";
    continueButton.textContent = t("languageSave");

    const renderOptions = () => {
      list.replaceChildren();
      for (const item of I.SUPPORTED_LANGUAGES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "duochat-language-option";
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(item.id === selected));
        const code = document.createElement("span");
        code.textContent = item.id.toUpperCase();
        const label = document.createElement("strong");
        label.textContent = item.nativeLabel;
        const check = document.createElement("b");
        check.textContent = item.id === selected ? "✓" : "";
        button.append(code, label, check);
        button.addEventListener("click", () => {
          selected = item.id;
          language = selected;
          panel.querySelector("h1").textContent = t("languageWelcomeTitle");
          panel.querySelector(".duochat-lead").textContent = t("languageWelcomeLead");
          continueButton.textContent = t("languageSave");
          renderOptions();
        });
        list.appendChild(button);
      }
    };

    continueButton.addEventListener("click", async () => {
      continueButton.disabled = true;
      try {
        const result = await send({ type: "SET_LANGUAGE", language: selected });
        language = result.language;
        await refresh();
      } catch (_error) {
        continueButton.disabled = false;
      }
    });
    renderOptions();
    panel.append(list, continueButton);
  }

  function showSetup() {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle(t("setupTitleBrowser"));
    const panel = gateShell(t("gateSetupTitle"), t("setupWizardLead"));
    const form = document.createElement("form");
    form.className = "duochat-form duochat-setup-wizard";
    form.innerHTML = `
      <div class="duochat-field">
        <label for="dc-profile-count">${t("profileCount")}</label>
        <select id="dc-profile-count" name="profileCount">
          ${Array.from({ length: 7 }, (_, index) => index + 2).map((count) => `<option value="${count}" ${count === 2 ? "selected" : ""}>${count}</option>`).join("")}
        </select>
      </div>
      <div class="duochat-setup-profiles"></div>
      <div class="duochat-field">
        <label for="dc-first-profile">${t("firstProfile")}</label>
        <select id="dc-first-profile" name="firstProfile"></select>
      </div>
      <label class="duochat-check"><input name="importVisible" type="checkbox" checked><span>${t("importVisibleHelp")}</span></label>
      <label class="duochat-check"><input name="autoAssignNew" type="checkbox" checked><span>${t("autoAssignNew")}</span></label>
      <label class="duochat-check"><input name="promptUnassigned" type="checkbox" checked><span>${t("promptUnassigned")}</span></label>
      <p class="duochat-error" role="alert" aria-live="polite"></p>
      <button class="duochat-button duochat-button-primary" type="submit">${t("createProtectedProfiles")}</button>
    `;
    panel.appendChild(form);

    const profilesRoot = form.querySelector(".duochat-setup-profiles");
    const firstSelect = form.elements.firstProfile;
    const templateOptions = [
      ["personal", "templatePersonal", "👤"],
      ["work", "templateWork", "💼"],
      ["study", "templateStudy", "🎓"],
      ["development", "templateDevelopment", "💻"],
      ["guest", "templateGuest", "🕒"],
      ["child", "templateChild", "🧩"]
    ];
    const accents = ["#7667F5", "#22A06B", "#D97706", "#E5484D", "#2563EB", "#9333EA", "#0891B2", "#DB2777"];

    const renderProfiles = () => {
      const count = Math.max(2, Math.min(8, Number(form.elements.profileCount.value) || 2));
      const previous = [...profilesRoot.querySelectorAll(".duochat-setup-profile")].map((card) => ({
        name: card.querySelector('[name="name"]').value,
        template: card.querySelector('[name="template"]').value,
        password: card.querySelector('[name="password"]').value,
        confirm: card.querySelector('[name="confirm"]').value
      }));
      profilesRoot.replaceChildren();
      firstSelect.replaceChildren();
      for (let index = 0; index < count; index += 1) {
        const saved = previous[index] || {};
        const defaultName = index === 0 ? t("defaultUserA") : index === 1 ? t("defaultUserB") : `${t("users")} ${index + 1}`;
        const card = document.createElement("section");
        card.className = "duochat-setup-profile";
        card.dataset.index = String(index);
        card.innerHTML = `
          <div class="duochat-setup-profile-head"><strong>${index === 0 ? t("administrator") : `${t("profileName")} ${index + 1}`}</strong><span style="--duochat-profile-color:${accents[index]}"></span></div>
          <div class="duochat-grid duochat-grid-setup">
            <div class="duochat-field"><label>${t("profileName")}</label><input name="name" maxlength="30" autocomplete="nickname" value="${String(saved.name || defaultName).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\"/g,"&quot;")}"></div>
            <div class="duochat-field"><label>${t("profileTemplate")}</label><select name="template">${templateOptions.map(([value, key, icon]) => `<option value="${value}" ${saved.template === value || (!saved.template && value === (index === 0 ? "personal" : "personal")) ? "selected" : ""}>${icon} ${t(key)}</option>`).join("")}</select></div>
            <div class="duochat-field"><label>${t("profilePassword")}</label><input name="password" type="password" minlength="${C.MIN_PASSWORD_LENGTH}" autocomplete="new-password" required value="${String(saved.password || "").replace(/&/g,"&amp;").replace(/\"/g,"&quot;")}"></div>
            <div class="duochat-field"><label>${t("confirmPasswordGeneric")}</label><input name="confirm" type="password" minlength="${C.MIN_PASSWORD_LENGTH}" autocomplete="new-password" required value="${String(saved.confirm || "").replace(/&/g,"&amp;").replace(/\"/g,"&quot;")}"></div>
          </div>
        `;
        const nameInput = card.querySelector('[name="name"]');
        nameInput.addEventListener("input", () => {
          const option = firstSelect.querySelector(`option[value="${index}"]`);
          if (option) option.textContent = nameInput.value.trim() || defaultName;
        });
        profilesRoot.appendChild(card);
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = saved.name || defaultName;
        firstSelect.appendChild(option);
      }
    };

    form.elements.profileCount.addEventListener("change", renderProfiles);
    renderProfiles();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = form.querySelector(".duochat-error");
      const submit = form.querySelector('[type="submit"]');
      error.textContent = "";
      const cards = [...profilesRoot.querySelectorAll(".duochat-setup-profile")];
      const profiles = [];
      const names = new Set();
      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const name = card.querySelector('[name="name"]').value.trim() || `${t("users")} ${index + 1}`;
        const password = card.querySelector('[name="password"]').value;
        const confirm = card.querySelector('[name="confirm"]').value;
        const template = card.querySelector('[name="template"]').value;
        if (password !== confirm) {
          error.textContent = t("passwordMismatchProfile", { name });
          card.querySelector('[name="confirm"]').focus();
          return;
        }
        if (!C.isValidPassword(password)) {
          error.textContent = t("eachPassword", { count: C.MIN_PASSWORD_LENGTH });
          card.querySelector('[name="password"]').focus();
          return;
        }
        const nameKey = name.toLocaleLowerCase();
        if (names.has(nameKey)) {
          error.textContent = t("errorDuplicateProfile");
          card.querySelector('[name="name"]').focus();
          return;
        }
        names.add(nameKey);
        profiles.push({
          name,
          password,
          template,
          avatar: templateOptions.find((item) => item[0] === template)?.[2] || "👤",
          accent: accents[index % accents.length],
          temporary: template === "guest" ? { mode: "session" } : null
        });
      }

      submit.disabled = true;
      submit.textContent = t("creating");
      try {
        const visibleEntities = form.elements.importVisible.checked
          ? collectVisibleEntities()
          : { conversationIds: [], projectIds: [] };
        const firstIndex = Math.max(0, Number(form.elements.firstProfile.value) || 0);
        const firstProfileId = firstIndex === 0 ? "A" : firstIndex === 1 ? "B" : `P${firstIndex + 1}`;
        const result = await send({
          type: "CONFIGURE_ADVANCED",
          profiles,
          firstProfileId,
          firstProfileIndex: firstIndex,
          conversationIds: visibleEntities.conversationIds,
          projectIds: visibleEntities.projectIds,
          ruleDefaults: {
            autoAssignNew: form.elements.autoAssignNew.checked,
            promptUnassigned: form.elements.promptUnassigned.checked
          }
        });
        snapshot = result.snapshot;
        showRecoveryKey(result.recoveryKey);
      } catch (setupError) {
        error.textContent = friendlyError(setupError.message);
        submit.disabled = false;
        submit.textContent = t("createProtectedProfiles");
      }
    });
    requestAnimationFrame(() => profilesRoot.querySelector('[name="password"]')?.focus());
  }

  function showRecoveryKey(recoveryKey) {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle(t("setupTitleBrowser"));
    const panel = gateShell(t("recoveryKeyTitle"), t("recoveryKeyLead"));
    const box = document.createElement("div");
    box.className = "duochat-recovery-box";
    const code = document.createElement("code");
    code.textContent = recoveryKey;
    const warning = document.createElement("p");
    warning.className = "duochat-note";
    warning.textContent = t("recoveryKeyWarning");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "duochat-button duochat-button-secondary";
    copy.textContent = t("copy");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(recoveryKey); copy.textContent = t("copied"); }
      catch (_error) { code.focus?.(); }
    });
    const done = document.createElement("button");
    done.type = "button";
    done.className = "duochat-button duochat-button-primary";
    done.textContent = t("recoveryKeySaved");
    done.addEventListener("click", () => evaluateRoute(true));
    box.append(code, warning, copy, done);
    panel.appendChild(box);
  }

  function showLogin(preselectedId) {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle(t("lockedTitleBrowser"));
    const panel = gateShell(t("gateLoginTitle", { site: siteName }), t("gateLoginLead"));
    const form = document.createElement("form");
    form.className = "duochat-form";
    form.innerHTML = `
      <div class="duochat-profile-list" role="group" aria-label="${t("profileChoiceAria")}"></div>
      <div class="duochat-field"><label for="dc-login-password">${t("password")}</label><input id="dc-login-password" name="password" type="password" autocomplete="current-password" required></div>
      <p class="duochat-error" role="alert" aria-live="polite"></p>
      <button class="duochat-button duochat-button-primary" type="submit">${t("openSpace")}</button>
      <p class="duochat-note">${t("loginNote")}</p>
    `;
    panel.appendChild(form);
    const list = form.querySelector(".duochat-profile-list");
    let selectedId = C.isValidProfileId(preselectedId) ? preselectedId : snapshot.activeProfileId || "A";
    for (const id of snapshot.profileOrder) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "duochat-profile-choice";
      button.dataset.profile = id;
      button.setAttribute("aria-pressed", String(id === selectedId));
      const strong = document.createElement("strong");
      strong.textContent = snapshot.profiles[id].name;
      const span = document.createElement("span");
      span.textContent = id === snapshot.activeProfileId ? t("lastProfileUsed") : t("spaceId", { id });
      button.append(strong, span);
      button.addEventListener("click", () => {
        selectedId = id;
        for (const item of list.children) item.setAttribute("aria-pressed", String(item === button));
        form.elements.password.focus();
      });
      list.appendChild(button);
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const error = form.querySelector(".duochat-error");
      submit.disabled = true;
      error.textContent = "";
      try {
        const targetProfile = snapshot.profiles[selectedId];
        if (targetProfile && targetProfile.webauthnEnabled) {
          throw new Error("WEBAUTHN_POPUP_REQUIRED");
        }
        snapshot = await send({ type: "UNLOCK", profileId: selectedId, password: form.elements.password.value });
        language = I.normalizeLanguage(snapshot.activeSettings && snapshot.activeSettings.language) || language;
        await evaluateRoute(true);
      } catch (loginError) {
        error.textContent = friendlyError(loginError.message);
        submit.disabled = false;
        form.elements.password.select();
      }
    });
    requestAnimationFrame(() => form.elements.password.focus());
  }

  function safeAccessDeniedUrl() {
    try {
      const target = new URL(homeUrl);
      target.searchParams.set("duochat_access_denied", "1");
      return target.href;
    } catch (_error) {
      return homeUrl;
    }
  }

  function showSafeAccessDenied() {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle("DuoChat — Access denied");
    const panel = gateShell(t("safeDeniedTitle"), t("safeDeniedLead"));
    const actions = document.createElement("div");
    actions.className = "duochat-actions";
    const back = document.createElement("button");
    back.className = "duochat-button duochat-button-primary";
    back.textContent = t("home");
    back.addEventListener("click", () => location.replace(homeUrl));
    actions.appendChild(back);
    panel.appendChild(actions);
  }

  function showBlocked(ownerId, entityType = "conversation") {
    document.documentElement.classList.add("duochat-pending");
    const deniedUrl = safeAccessDeniedUrl();
    try { originalReplaceState({}, "", deniedUrl); currentUrl = deniedUrl; } catch (_error) { /* URL shielding is best-effort; DOM protection remains mandatory. */ }
    const isProject = entityType === "project";
    shieldBrowserTitle(t(isProject ? "projectProtectedBrowser" : "conversationProtectedBrowser"));
    const ownerName = snapshot.profiles[ownerId]
      ? snapshot.profiles[ownerId].name
      : t("genericUser", { id: ownerId });
    const panel = gateShell(
      t(isProject ? "protectedProjectTitle" : "protectedConversationTitle"),
      t(isProject ? "protectedProjectLead" : "protectedConversationLead", { owner: ownerName })
    );
    const actions = document.createElement("div");
    actions.className = "duochat-actions";
    const back = document.createElement("button");
    back.className = "duochat-button duochat-button-primary";
    back.textContent = t("home");
    back.addEventListener("click", () => location.assign(homeUrl));
    const change = document.createElement("button");
    change.className = "duochat-button duochat-button-secondary";
    change.textContent = t("loginAs", { owner: ownerName });
    change.addEventListener("click", () => showLogin(ownerId));
    actions.append(back, change);
    panel.appendChild(actions);
  }

  function collectConversationIdsForProject(projectId) {
    const ids = new Set();
    for (const link of document.querySelectorAll('a[href]')) {
      const conversationId = C.extractConversationId(link.href);
      if (!conversationId) continue;
      const contextId = getProjectContextForConversationLink(link, projectId);
      const inMainContent = Boolean(link.closest('main, [role="main"]')) && !link.closest('nav, aside, [role="navigation"]');
      if (contextId === projectId || inMainContent) ids.add(conversationId);
    }
    return [...ids];
  }

  function showUnassigned(entityType, entityId) {
    document.documentElement.classList.add("duochat-pending");
    const isProject = entityType === "project";
    shieldBrowserTitle(t(isProject ? "projectUnassignedBrowser" : "conversationUnassignedBrowser"));
    const panel = gateShell(
      t(isProject ? "unassignedProjectTitle" : "unassignedConversationTitle"),
      t(isProject ? "unassignedProjectLead" : "unassignedConversationLead")
    );
    const error = document.createElement("p");
    error.className = "duochat-error";
    error.setAttribute("role", "alert");
    const actions = document.createElement("div");
    actions.className = "duochat-actions duochat-profile-claim-actions";

    async function claimAs(profileId, password = null) {
      const target = snapshot.profiles[profileId];
      if (!target) throw new Error("INVALID_PROFILE");
      if (profileId !== snapshot.activeProfileId) {
        if (target.webauthnEnabled) throw new Error("WEBAUTHN_POPUP_REQUIRED");
        snapshot = await send({ type: "UNLOCK", profileId, password });
      }
      snapshot = await send(
        isProject
          ? { type: "CLAIM_PROJECT_WITH_CONVERSATIONS", projectId: entityId, conversationIds: collectConversationIdsForProject(entityId) }
          : { type: "CLAIM_CONVERSATION", conversationId: entityId }
      );
      await evaluateRoute(true);
    }

    for (const profileId of snapshot.profileOrder) {
      const target = snapshot.profiles[profileId];
      if (!target) continue;
      const button = document.createElement("button");
      button.className = profileId === snapshot.activeProfileId ? "duochat-button duochat-button-primary" : "duochat-button duochat-button-secondary";
      button.textContent = t("assignTo", { owner: target.name });
      button.addEventListener("click", async () => {
        button.disabled = true;
        error.textContent = "";
        try {
          let password = null;
          if (profileId !== snapshot.activeProfileId) {
            if (target.webauthnEnabled) {
              error.textContent = t("webauthnAssignPopupRequired");
              button.disabled = false;
              return;
            }
            password = window.prompt(t("passwordOf", { name: target.name }));
            if (password === null) { button.disabled = false; return; }
          }
          if (isProject) button.textContent = t("assigningProjectChats");
          await claimAs(profileId, password);
        } catch (claimError) {
          error.textContent = claimError.message === "WRONG_PASSWORD" ? t("errorWrongPassword") : friendlyError(claimError.message);
          button.disabled = false;
          button.textContent = t("assignTo", { owner: target.name });
        }
      });
      actions.appendChild(button);
    }
    const back = document.createElement("button");
    back.className = "duochat-button duochat-button-secondary";
    back.textContent = t("doNotOpen");
    back.addEventListener("click", () => location.assign(homeUrl));
    actions.appendChild(back);
    panel.append(error, actions);
  }

  function isLinkInsideOpenProject(link, projectId) {
    const linkedProjectId = C.extractProjectId(link.href);
    if (linkedProjectId === projectId) return true;
    return !link.closest('nav, aside, [role="navigation"]');
  }

  function findNestedProjectId(link) {
    let ancestor = link.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth += 1) {
      if (ancestor.matches('nav, aside, [role="navigation"]')) break;
      const projectIds = new Set();
      for (const candidate of ancestor.querySelectorAll('a[href]')) {
        const candidateProjectId = C.extractProjectId(candidate.href);
        if (candidateProjectId) projectIds.add(candidateProjectId);
        if (projectIds.size > 1) break;
      }
      if (projectIds.size === 1) return [...projectIds][0];
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function getProjectContextForConversationLink(link, openProjectId = C.extractProjectId(location.href)) {
    const linkedProjectId = C.extractProjectId(link.href);
    if (linkedProjectId) return linkedProjectId;
    if (openProjectId && isLinkInsideOpenProject(link, openProjectId)) return openProjectId;
    return findNestedProjectId(link);
  }

  function getVisibilityContainer(link) {
    const row = link.closest('li, [role="listitem"], [data-testid*="history" i], [data-testid*="recent" i], [data-testid*="file" i]');
    if (!row) return link;
    // Hide the complete visual row (including labels/buttons outside the <a>) whenever
    // it is a small item. This prevents project/chat/file titles from leaking in sidebars
    // or recent-item lists even if ChatGPT/Claude moves the title outside the anchor.
    const anchors = row.querySelectorAll('a[href]');
    return anchors.length <= 4 ? row : link;
  }

  function setLinkVisibility(link, visible) {
    const container = getVisibilityContainer(link);
    if (visible) {
      link.setAttribute("data-duochat-allowed", "true");
      link.removeAttribute("data-duochat-hidden");
      link.removeAttribute("data-duochat-unassigned");
      if (container !== link) container.removeAttribute("data-duochat-hidden-container");
    } else {
      link.removeAttribute("data-duochat-allowed");
      link.setAttribute("data-duochat-hidden", "true");
      link.removeAttribute("data-duochat-unassigned");
      if (container !== link) container.setAttribute("data-duochat-hidden-container", "true");
    }
  }

  function claimVisibleProjectChats(projectId, conversationIds) {
    if (projectChatClaimInFlight || !projectId || conversationIds.length === 0) return;
    projectChatClaimInFlight = true;
    send({ type: "CLAIM_PROJECT_WITH_CONVERSATIONS", projectId, conversationIds })
      .then((nextSnapshot) => {
        snapshot = nextSnapshot;
        filterProtectedLinks();
      })
      .catch(() => undefined)
      .finally(() => {
        projectChatClaimInFlight = false;
      });
  }

  function filterProtectedLinks() {
    if (!snapshot || !snapshot.configured || !snapshot.unlocked) return;
    document.documentElement.classList.add("duochat-guarded");
    const openProjectId = C.extractProjectId(location.href);
    const openProjectIsOwn = Boolean(
      openProjectId && snapshot.projectOwners[openProjectId] === snapshot.activeProfileId
    );
    const projectConversationIds = new Set();

    for (const link of document.querySelectorAll('a[href]')) {
      const projectId = C.extractProjectId(link.href);
      if (projectId) {
        const projectOwner = snapshot.projectOwners[projectId];
        const projectIsOwn = projectOwner === snapshot.activeProfileId;
        // 1.4 security: unassigned projects stay hidden as well. There is no sidebar reveal switch.
        const projectMeta = metaFor("project", projectId);
        const projectVisible = projectIsOwn && focusAllows("project", projectId, projectMeta) && !(projectMeta && projectMeta.hidden);
        setLinkVisibility(link, projectVisible);
        if (!projectVisible) continue;
      }

      const conversationId = C.extractConversationId(link.href);
      if (!conversationId) continue;
      const conversationOwner = snapshot.conversationOwners[conversationId];
      const conversationIsOwn = conversationOwner === snapshot.activeProfileId;
      const conversationProjectId = getProjectContextForConversationLink(link, openProjectId);
      const conversationProjectOwner = conversationProjectId
        ? snapshot.projectOwners[conversationProjectId]
        : null;

      if (conversationProjectId && conversationProjectOwner !== snapshot.activeProfileId) {
        setLinkVisibility(link, false);
        continue;
      }

      const belongsToOwnedProject = Boolean(
        !conversationOwner &&
        ((openProjectIsOwn && isLinkInsideOpenProject(link, openProjectId)) ||
          conversationProjectOwner === snapshot.activeProfileId)
      );

      // Unassigned standalone conversations stay hidden. Unassigned conversations inside
      // the active user's project are visible and are immediately attached to that project owner.
      const conversationMeta = metaFor("conversation", conversationId);
      const baseVisible = conversationIsOwn || belongsToOwnedProject;
      const focusVisible = focusAllows("conversation", conversationId, conversationMeta);
      const notHidden = !(conversationMeta && conversationMeta.hidden);
      setLinkVisibility(link, baseVisible && focusVisible && notHidden);
      if (belongsToOwnedProject && openProjectId) projectConversationIds.add(conversationId);
    }

    if (openProjectIsOwn) {
      for (const id of collectConversationIdsForProject(openProjectId)) {
        if (!snapshot.conversationOwners[id]) projectConversationIds.add(id);
      }
      claimVisibleProjectChats(openProjectId, [...projectConversationIds]);
    }
    applyFunctionRestrictions();
    applyVisualProtection();
    syncVisibleMetadata();
  }

  async function evaluateRoute(isInitial = false) {
    routeEvaluationCount += 1;
    const evaluationId = routeEvaluationCount;
    if (!snapshot.configured) {
      showSetup();
      return;
    }
    if (!snapshot.unlocked) {
      showLogin(snapshot.activeProfileId);
      return;
    }
    try {
      if (new URL(location.href).searchParams.get("duochat_access_denied") === "1") {
        showSafeAccessDenied();
        return;
      }
    } catch (_error) {}
    const projectId = C.extractProjectId(location.href);
    const conversationId = C.extractConversationId(location.href);
    if (!projectId && !conversationId) {
      previousConversationId = null;
      previousProjectId = null;
      removeGateAndReveal();
      return;
    }

    if (projectId) {
      let projectOwner = snapshot.projectOwners[projectId];
      if (projectOwner && projectOwner !== snapshot.activeProfileId) {
        showBlocked(projectOwner, "project");
        return;
      }
      if (!projectOwner) {
        // Projects are deliberately never silently claimed: DuoChat immediately asks
        // which profile owns a newly detected or legacy project. This prevents a project
        // created while the wrong profile is active from being leaked or mis-assigned.
        send({ type: "RECORD_UNASSIGNED_ENTITY", entityType: "project", entityId: projectId, title: document.title, url: location.href }).catch(() => undefined);
        showUnassigned("project", projectId);
        return;
      }
      const projectMeta = metaFor("project", projectId);
      if (projectMeta && projectMeta.extraLock && !isSensitiveAuthorized(projectId)) {
        showSensitiveChallenge(projectId, "project");
        return;
      }
      previousProjectId = projectId;
    } else {
      previousProjectId = null;
    }

    if (!conversationId) {
      previousConversationId = null;
      removeGateAndReveal();
      return;
    }

    const conversationOwner = snapshot.conversationOwners[conversationId];
    if (conversationOwner && conversationOwner !== snapshot.activeProfileId) {
      showBlocked(conversationOwner, "conversation");
      return;
    }
    if (conversationOwner === snapshot.activeProfileId) {
      const meta = metaFor("conversation", conversationId);
      if (meta && meta.extraLock && !isSensitiveAuthorized(conversationId)) {
        showSensitiveChallenge(conversationId, "conversation");
        return;
      }
      previousConversationId = conversationId;
      removeGateAndReveal();
      return;
    }

    const belongsToOwnedProject = Boolean(
      projectId && snapshot.projectOwners[projectId] === snapshot.activeProfileId
    );
    const createdFromHome = !isInitial && previousConversationId === null;
    if (belongsToOwnedProject || createdFromHome) {
      try {
        snapshot = await send({
          type: "AUTO_ASSIGN_ENTITY",
          entityType: "conversation",
          entityId: conversationId,
          projectId,
          siteId: currentSite && currentSite.id,
          title: document.title,
          url: location.href
        }) || await send({ type: "GET_SNAPSHOT" });
        snapshot = await send({ type: "GET_SNAPSHOT" });
        if (evaluationId !== routeEvaluationCount) return;
        const autoOwner = snapshot.conversationOwners[conversationId];
        if (autoOwner && autoOwner !== snapshot.activeProfileId) {
          showBlocked(autoOwner, "conversation");
          return;
        }
        if (autoOwner === snapshot.activeProfileId) {
          previousConversationId = conversationId;
          removeGateAndReveal();
          return;
        }
      } catch (_error) {
        snapshot = await send({ type: "GET_SNAPSHOT" });
      }
    }
    send({ type: "RECORD_UNASSIGNED_ENTITY", entityType: "conversation", entityId: conversationId, projectId, title: document.title, url: location.href }).catch(() => undefined);
    showUnassigned("conversation", conversationId);
  }

  async function refresh() {
    try {
      const [nextSnapshot, languageResult] = await Promise.all([
        send({ type: "GET_SNAPSHOT" }),
        send({ type: "GET_LANGUAGE" })
      ]);
      snapshot = nextSnapshot;
      language = I.normalizeLanguage(nextSnapshot.activeSettings && nextSnapshot.activeSettings.language) || I.normalizeLanguage(languageResult.language);
      if (!language) {
        showLanguageChooser();
        return;
      }
      await evaluateRoute(true);
    } catch (_error) {
      document.documentElement.classList.remove("duochat-pending");
    }
  }

  function handlePotentialNavigation() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    document.documentElement.classList.add("duochat-pending");
    evaluateRoute(false).catch(refresh);
  }

  document.addEventListener(
    "click",
    async (event) => {
      if (!snapshot || !snapshot.unlocked) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link) return;
      sendActivity();
      try {
        const targetUrl = new URL(link.href, location.href);
        const supportedTarget = C.getSupportedSite(targetUrl.href);
        const settings = activeSettings();
        const externalRestricted = Array.isArray(settings.hiddenFunctions) && settings.hiddenFunctions.includes("external_links");
        const whitelist = Array.isArray(settings.externalDomains) ? settings.externalDomains : [];
        if (!supportedTarget && targetUrl.protocol.startsWith("http") && (externalRestricted || whitelist.length) && !C.isDomainAllowed(targetUrl.href, whitelist)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          document.documentElement.classList.add("duochat-pending");
          send({ type: "RECORD_SECURITY_EVENT", action: "external_link_blocked", detail: targetUrl.hostname }).catch(() => undefined);
          showExternalBlocked(targetUrl.href);
          return;
        }
      } catch (_error) {}
      const projectId = C.extractProjectId(link.href);
      const conversationId = C.extractConversationId(link.href);
      if (!projectId && !conversationId) return;

      if (projectId) {
        const projectOwner = snapshot.projectOwners[projectId];
        if (projectOwner && projectOwner !== snapshot.activeProfileId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showBlocked(projectOwner, "project");
          return;
        }
        if (!projectOwner) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showUnassigned("project", projectId);
          return;
        }
      }

      if (!conversationId) return;
      const conversationOwner = snapshot.conversationOwners[conversationId];
      if (conversationOwner && conversationOwner !== snapshot.activeProfileId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showBlocked(conversationOwner, "conversation");
        return;
      }
      if (!conversationOwner) {
        const openProjectId = C.extractProjectId(location.href);
        const linkedProjectId = getProjectContextForConversationLink(link, openProjectId);
        const isOwnedProjectChat = Boolean(
          (linkedProjectId && snapshot.projectOwners[linkedProjectId] === snapshot.activeProfileId) ||
          (openProjectId &&
            snapshot.projectOwners[openProjectId] === snapshot.activeProfileId &&
            isLinkInsideOpenProject(link, openProjectId))
        );
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!isOwnedProjectChat) {
          showUnassigned("conversation", conversationId);
          return;
        }
        try {
          snapshot = await send({ type: "CLAIM_CONVERSATION", conversationId });
          location.assign(link.href);
        } catch (_error) {
          showUnassigned("conversation", conversationId);
        }
      }
    },
    true
  );

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    const result = originalPushState(...args);
    queueMicrotask(handlePotentialNavigation);
    return result;
  };
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    const result = originalReplaceState(...args);
    queueMicrotask(handlePotentialNavigation);
    return result;
  };
  addEventListener("popstate", handlePotentialNavigation);

  observer = new MutationObserver(() => {
    enforceTitleShield();
    handlePotentialNavigation();
    filterProtectedLinks();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === "DUOCHAT_REFRESH") {
      document.documentElement.classList.add("duochat-pending");
      shieldBrowserTitle(t("verifyingTitle"));
      refresh();
    }
    if (message.type === "DUOCHAT_PANIC") {
      closeCommandPalette();
      document.documentElement.classList.add("duochat-pending");
      shieldBrowserTitle("DuoChat — Locked");
      if (activeSettings().panicNavigateHome !== false) location.replace(homeUrl);
      else refresh();
    }
    if (message.type === "DUOCHAT_PROFILE_PICKER" && snapshot && snapshot.unlocked) showLogin(snapshot.activeProfileId);
  });

  function shortcutMatches(event, spec) {
    const value = String(spec || "").trim().toLowerCase();
    if (!value) return false;
    const parts = value.split("+").map((x) => x.trim()).filter(Boolean);
    const key = parts.find((x) => !["ctrl","control","alt","shift","meta","cmd","command"].includes(x));
    if (!key) return false;
    const wantCtrl = parts.includes("ctrl") || parts.includes("control");
    const wantAlt = parts.includes("alt");
    const wantShift = parts.includes("shift");
    const wantMeta = parts.includes("meta") || parts.includes("cmd") || parts.includes("command");
    const actualKey = String(event.key || "").toLowerCase();
    return actualKey === key && event.ctrlKey === wantCtrl && event.altKey === wantAlt && event.shiftKey === wantShift && event.metaKey === wantMeta;
  }

  document.addEventListener("keydown", (event) => {
    sendActivity();
    const shortcuts = activeSettings().shortcuts || {};
    if (shortcutMatches(event, shortcuts.palette || "Ctrl+K") || ((event.metaKey && !event.ctrlKey) && shortcutMatches(event, "Meta+K"))) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (paletteOpen) closeCommandPalette(); else openCommandPalette();
      return;
    }
    if (shortcutMatches(event, shortcuts.panic || "Alt+Shift+X")) {
      event.preventDefault(); event.stopImmediatePropagation();
      send({ type: "PANIC_LOCK" }).catch(() => undefined); return;
    }
    if (shortcutMatches(event, shortcuts.lock || "Alt+Shift+L")) {
      event.preventDefault(); event.stopImmediatePropagation();
      send({ type: "LOGICAL_LOGOUT" }).catch(() => undefined); return;
    }
    if (shortcutMatches(event, shortcuts.presentation || "Alt+Shift+V")) {
      event.preventDefault(); event.stopImmediatePropagation();
      send({ type: "SET_MODE", mode: "presentation", enabled: !snapshot.presentationMode }).catch(() => undefined); return;
    }
    if (shortcutMatches(event, shortcuts.screenshot || "Alt+Shift+S")) {
      event.preventDefault(); event.stopImmediatePropagation();
      send({ type: "SET_MODE", mode: "screenshot", enabled: !snapshot.screenshotMode }).catch(() => undefined); return;
    }
    if (event.key === "Escape" && paletteOpen) closeCommandPalette();
  }, true);
  for (const activityEvent of ["pointerdown", "scroll", "touchstart"]) {
    addEventListener(activityEvent, sendActivity, { capture: true, passive: true });
  }
  addEventListener("focus", sendActivity, true);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { sendActivity(); refresh(); } });
  addEventListener("pageshow", () => refresh());

  setInterval(handlePotentialNavigation, 350);
  refresh();
})();
