"use strict";

(function runPopup() {
  const C = globalThis.DuoChatCore;
  const views = {
    loading: document.getElementById("loading-view"),
    setup: document.getElementById("setup-view"),
    locked: document.getElementById("locked-view"),
    unlocked: document.getElementById("unlocked-view")
  };
  const statusPill = document.getElementById("status-pill");
  let snapshot = null;
  let selectedProfileId = null;
  let switchTargetId = null;

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

  function showView(name) {
    for (const [key, element] of Object.entries(views)) element.hidden = key !== name;
  }

  function friendlyError(code) {
    if (code === "WRONG_PASSWORD") return "Mot de passe incorrect.";
    if (code === "PASSWORD_TOO_SHORT") return `Utilise au moins ${C.MIN_PASSWORD_LENGTH} caractères.`;
    if (code === "PROFILE_NAME_ALREADY_EXISTS") return "Ce nom d’utilisateur existe déjà.";
    if (code === "INVALID_TRANSFER_CODE") return "Ce code de transfert n’est pas valide.";
    if (code === "LOCKED") return "Déverrouille d’abord l’espace actif.";
    if (code && code.startsWith("TEMPORARILY_BLOCKED:")) {
      return `Trop d’essais. Réessaie dans ${code.split(":")[1]} secondes.`;
    }
    return "Une erreur est survenue. Réessaie.";
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
      detail.textContent = id === snapshot.activeProfileId ? "Dernier utilisé" : "Profil protégé";
      button.append(avatar, name, detail);
      button.addEventListener("click", () => {
        selectedProfileId = id;
        for (const item of container.children) {
          item.setAttribute("aria-pressed", String(item === button));
        }
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
      detail.textContent = "Mot de passe requis";
      copy.append(name, detail);
      button.append(avatar, copy, createChevron());
      button.addEventListener("click", () => {
        switchTargetId = id;
        const form = document.getElementById("switch-form");
        document.getElementById("switch-label").textContent = `Mot de passe de ${profile.name}`;
        form.hidden = false;
        requestAnimationFrame(() => form.elements.password.focus());
      });
      container.appendChild(button);
    }
  }

  function render() {
    statusPill.classList.toggle("open", snapshot.unlocked);
    if (!snapshot.configured) {
      statusPill.textContent = "À configurer";
      showView("setup");
      return;
    }
    if (!snapshot.unlocked) {
      statusPill.textContent = "Verrouillé";
      buildLockedProfiles();
      showView("locked");
      requestAnimationFrame(() => document.getElementById("unlock-password").focus());
      return;
    }
    statusPill.textContent = "Ouvert";
    const active = snapshot.profiles[snapshot.activeProfileId];
    document.getElementById("current-avatar").textContent = profileInitial(active);
    document.getElementById("current-name").textContent = active.name;
    document.getElementById("recovery-toggle").checked = snapshot.recoveryMode;
    document.getElementById("switch-form").hidden = true;
    document.getElementById("add-profile-form").hidden = true;
    document.getElementById("show-add-profile").hidden = false;
    switchTargetId = null;
    buildOtherProfiles();
    showView("unlocked");
  }

  async function importCode(code, feedbackElement) {
    feedbackElement.textContent = "Importation…";
    try {
      const result = await send({ type: "IMPORT_TRANSFER_CODE", code });
      snapshot = result.snapshot;
      const additions = `${result.importedProfiles} profil(s) et ${result.importedEntities} attribution(s) ajouté(s)`;
      feedbackElement.textContent = result.conflicts
        ? `${additions}. ${result.conflicts} conflit(s) conservé(s) localement.`
        : `${additions}.`;
      render();
      return true;
    } catch (error) {
      feedbackElement.textContent = friendlyError(error.message);
      return false;
    }
  }

  document.getElementById("open-chatgpt").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://chatgpt.com/" });
  });

  document.getElementById("open-claude").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://claude.ai/new" });
  });

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
      snapshot = await send({
        type: "UNLOCK",
        profileId: selectedProfileId,
        password: form.elements.password.value
      });
      form.reset();
      render();
    } catch (unlockError) {
      error.textContent = friendlyError(unlockError.message);
      submit.disabled = false;
      form.elements.password.select();
    }
  });

  document.getElementById("recovery-toggle").addEventListener("change", async (event) => {
    const toggle = event.currentTarget;
    toggle.disabled = true;
    try {
      snapshot = await send({ type: "SET_RECOVERY_MODE", enabled: toggle.checked });
      toggle.checked = snapshot.recoveryMode;
    } catch (_error) {
      toggle.checked = !toggle.checked;
    } finally {
      toggle.disabled = false;
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
      error.textContent = "Choisis un utilisateur.";
      return;
    }
    submit.disabled = true;
    error.textContent = "";
    try {
      snapshot = await send({
        type: "UNLOCK",
        profileId: switchTargetId,
        password: form.elements.password.value
      });
      form.reset();
      submit.disabled = false;
      render();
    } catch (switchError) {
      error.textContent = friendlyError(switchError.message);
      submit.disabled = false;
      form.elements.password.select();
    }
  });

  document.getElementById("show-add-profile").addEventListener("click", () => {
    document.getElementById("show-add-profile").hidden = true;
    document.getElementById("add-profile-form").hidden = false;
    requestAnimationFrame(() => document.getElementById("new-profile-name").focus());
  });

  document.getElementById("cancel-add-profile").addEventListener("click", () => {
    const form = document.getElementById("add-profile-form");
    form.reset();
    document.getElementById("add-profile-error").textContent = "";
    form.hidden = true;
    document.getElementById("show-add-profile").hidden = false;
  });

  document.getElementById("add-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.getElementById("add-profile-error");
    const submit = form.querySelector('[type="submit"]');
    error.textContent = "";
    if (form.elements.password.value !== form.elements.confirm.value) {
      error.textContent = "La confirmation du mot de passe ne correspond pas.";
      form.elements.confirm.focus();
      return;
    }
    submit.disabled = true;
    try {
      snapshot = await send({
        type: "ADD_PROFILE",
        name: form.elements.name.value,
        password: form.elements.password.value
      });
      form.reset();
      submit.disabled = false;
      render();
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
    status.textContent = "Génération…";
    try {
      const result = await send({ type: "EXPORT_TRANSFER_CODE" });
      textarea.value = result.code;
      status.textContent = "Code généré. Envoie-le uniquement à une personne de confiance.";
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
      status.textContent = "Génère ou colle d’abord un code.";
      return;
    }
    try {
      await navigator.clipboard.writeText(textarea.value.trim());
      status.textContent = "Code copié.";
    } catch (_error) {
      textarea.focus();
      textarea.select();
      status.textContent = "Le code est sélectionné : copie-le avec Ctrl+C.";
    }
  });

  document.getElementById("import-code").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const textarea = document.getElementById("transfer-code");
    button.disabled = true;
    await importCode(textarea.value, document.getElementById("transfer-status"));
    button.disabled = false;
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

  send({ type: "GET_SNAPSHOT" })
    .then((data) => {
      snapshot = data;
      render();
    })
    .catch(() => {
      statusPill.textContent = "Erreur";
      showView("setup");
    });
})();
