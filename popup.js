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
  let selectedProfileId = "A";

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
    if (code && code.startsWith("TEMPORARILY_BLOCKED:")) {
      return `Trop d’essais. Réessaie dans ${code.split(":")[1]} secondes.`;
    }
    return "Une erreur est survenue. Réessaie.";
  }

  function buildLockedProfiles() {
    const container = document.getElementById("locked-profiles");
    container.replaceChildren();
    selectedProfileId = snapshot.activeProfileId || "A";
    for (const id of C.PROFILE_IDS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-button";
      button.dataset.profile = id;
      button.setAttribute("aria-pressed", String(id === selectedProfileId));
      const avatar = document.createElement("span");
      avatar.className = "mini-avatar";
      avatar.textContent = id;
      const name = document.createElement("strong");
      name.textContent = snapshot.profiles[id].name;
      const detail = document.createElement("span");
      detail.textContent = id === snapshot.activeProfileId ? "Dernier utilisé" : `Espace ${id}`;
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
    const activeId = snapshot.activeProfileId;
    const otherId = activeId === "A" ? "B" : "A";
    document.getElementById("current-avatar").textContent = activeId;
    document.getElementById("current-name").textContent = snapshot.profiles[activeId].name;
    document.getElementById("other-avatar").textContent = otherId;
    document.getElementById("other-name").textContent = snapshot.profiles[otherId].name;
    document.getElementById("recovery-toggle").checked = snapshot.recoveryMode;
    document.getElementById("switch-form").hidden = true;
    document.getElementById("switch-profile").hidden = false;
    showView("unlocked");
  }

  document.getElementById("open-chatgpt").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://chatgpt.com/" });
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

  document.getElementById("switch-profile").addEventListener("click", () => {
    const otherId = snapshot.activeProfileId === "A" ? "B" : "A";
    const form = document.getElementById("switch-form");
    document.getElementById("switch-label").textContent = `Mot de passe de ${snapshot.profiles[otherId].name}`;
    document.getElementById("switch-profile").hidden = true;
    form.hidden = false;
    requestAnimationFrame(() => form.elements.password.focus());
  });

  document.getElementById("cancel-switch").addEventListener("click", () => {
    const form = document.getElementById("switch-form");
    form.reset();
    document.getElementById("switch-error").textContent = "";
    form.hidden = true;
    document.getElementById("switch-profile").hidden = false;
  });

  document.getElementById("switch-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const otherId = snapshot.activeProfileId === "A" ? "B" : "A";
    const submit = form.querySelector('[type="submit"]');
    const error = document.getElementById("switch-error");
    submit.disabled = true;
    error.textContent = "";
    try {
      snapshot = await send({
        type: "UNLOCK",
        profileId: otherId,
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
