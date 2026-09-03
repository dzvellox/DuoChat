"use strict";

document.documentElement.classList.add("duochat-pending");

(function runDuoChatGuard() {
  const C = globalThis.DuoChatCore;
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
  let protectedTitle = "DuoChat — Verrouillé";
  let pendingPageTitle = "";
  let pendingPageTitleUrl = "";

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
        <div class="duochat-brand-copy"><strong>DuoChat</strong><span>Profils locaux protégés</span></div>
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
    document.documentElement.classList.remove("duochat-pending");
    filterProtectedLinks();
  }

  function friendlyError(code) {
    if (code === "WRONG_PASSWORD") return "Mot de passe incorrect.";
    if (code === "PASSWORD_TOO_SHORT") return `Utilise au moins ${C.MIN_PASSWORD_LENGTH} caractères.`;
    if (code && code.startsWith("TEMPORARILY_BLOCKED:")) {
      return `Trop d’essais. Réessaie dans ${code.split(":")[1]} secondes.`;
    }
    if (code === "CONVERSATION_BELONGS_TO_OTHER_PROFILE") {
      return "Cette discussion appartient déjà à l’autre profil.";
    }
    if (code === "PROJECT_BELONGS_TO_OTHER_PROFILE") {
      return "Ce projet appartient déjà à l’autre profil.";
    }
    return "Une erreur est survenue. Recharge la page et réessaie.";
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

  function showSetup() {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle("DuoChat — Configuration");
    const panel = gateShell(
      "Créer les premiers profils",
      "Chaque profil possède son propre mot de passe et ne voit que les discussions et projets qui lui sont attribués."
    );
    const form = document.createElement("form");
    form.className = "duochat-form";
    form.innerHTML = `
      <div class="duochat-grid">
        <div class="duochat-fields">
          <div class="duochat-field"><label for="dc-name-a">Nom du profil A</label><input id="dc-name-a" name="nameA" value="Utilisateur A" autocomplete="nickname" maxlength="30"></div>
          <div class="duochat-field"><label for="dc-password-a">Mot de passe A</label><input id="dc-password-a" name="passwordA" type="password" minlength="6" autocomplete="new-password" required></div>
          <div class="duochat-field"><label for="dc-confirm-a">Confirmer le mot de passe A</label><input id="dc-confirm-a" name="confirmA" type="password" minlength="6" autocomplete="new-password" required></div>
        </div>
        <div class="duochat-fields">
          <div class="duochat-field"><label for="dc-name-b">Nom du profil B</label><input id="dc-name-b" name="nameB" value="Utilisateur B" autocomplete="nickname" maxlength="30"></div>
          <div class="duochat-field"><label for="dc-password-b">Mot de passe B</label><input id="dc-password-b" name="passwordB" type="password" minlength="6" autocomplete="new-password" required></div>
          <div class="duochat-field"><label for="dc-confirm-b">Confirmer le mot de passe B</label><input id="dc-confirm-b" name="confirmB" type="password" minlength="6" autocomplete="new-password" required></div>
        </div>
      </div>
      <div>
        <div class="duochat-label">Premier profil à ouvrir</div>
        <div class="duochat-profile-list" role="group" aria-label="Premier profil">
          <button class="duochat-profile-choice" type="button" data-profile="A" aria-pressed="true"><strong>Utilisateur A</strong><span>Profil mémorisé au démarrage</span></button>
          <button class="duochat-profile-choice" type="button" data-profile="B" aria-pressed="false"><strong>Utilisateur B</strong><span>Profil mémorisé au démarrage</span></button>
        </div>
      </div>
      <label class="duochat-check"><input name="importVisible" type="checkbox" checked><span>Attribuer les discussions et projets actuellement visibles dans la barre latérale au premier profil.</span></label>
      <p class="duochat-error" role="alert" aria-live="polite"></p>
      <button class="duochat-button duochat-button-primary" type="submit">Créer les profils</button>
    `;
    panel.appendChild(form);
    let firstProfileId = "A";
    const choices = [...form.querySelectorAll(".duochat-profile-choice")];
    const updateChoiceNames = () => {
      choices[0].querySelector("strong").textContent = form.elements.nameA.value.trim() || "Utilisateur A";
      choices[1].querySelector("strong").textContent = form.elements.nameB.value.trim() || "Utilisateur B";
    };
    form.elements.nameA.addEventListener("input", updateChoiceNames);
    form.elements.nameB.addEventListener("input", updateChoiceNames);
    for (const choice of choices) {
      choice.addEventListener("click", () => {
        firstProfileId = choice.dataset.profile;
        for (const item of choices) item.setAttribute("aria-pressed", String(item === choice));
      });
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = form.querySelector(".duochat-error");
      error.textContent = "";
      if (form.elements.passwordA.value !== form.elements.confirmA.value) {
        error.textContent = "La confirmation du mot de passe A ne correspond pas.";
        form.elements.confirmA.focus();
        return;
      }
      if (form.elements.passwordB.value !== form.elements.confirmB.value) {
        error.textContent = "La confirmation du mot de passe B ne correspond pas.";
        form.elements.confirmB.focus();
        return;
      }
      if (!C.isValidPassword(form.elements.passwordA.value) || !C.isValidPassword(form.elements.passwordB.value)) {
        error.textContent = `Chaque mot de passe doit contenir au moins ${C.MIN_PASSWORD_LENGTH} caractères.`;
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Création…";
      try {
        const visibleEntities = form.elements.importVisible.checked
          ? collectVisibleEntities()
          : { conversationIds: [], projectIds: [] };
        snapshot = await send({
          type: "CONFIGURE",
          nameA: form.elements.nameA.value,
          nameB: form.elements.nameB.value,
          passwordA: form.elements.passwordA.value,
          passwordB: form.elements.passwordB.value,
          firstProfileId,
          conversationIds: visibleEntities.conversationIds,
          projectIds: visibleEntities.projectIds
        });
        await evaluateRoute(true);
      } catch (setupError) {
        error.textContent = friendlyError(setupError.message);
        submit.disabled = false;
        submit.textContent = "Créer les profils";
      }
    });
    requestAnimationFrame(() => form.elements.passwordA.focus());
  }

  function showLogin(preselectedId) {
    document.documentElement.classList.add("duochat-pending");
    shieldBrowserTitle("DuoChat — Verrouillé");
    const panel = gateShell(`Qui utilise ${siteName} ?`, "Choisis ton espace puis saisis son mot de passe.");
    const form = document.createElement("form");
    form.className = "duochat-form";
    form.innerHTML = `
      <div class="duochat-profile-list" role="group" aria-label="Choix du profil"></div>
      <div class="duochat-field"><label for="dc-login-password">Mot de passe</label><input id="dc-login-password" name="password" type="password" autocomplete="current-password" required></div>
      <p class="duochat-error" role="alert" aria-live="polite"></p>
      <button class="duochat-button duochat-button-primary" type="submit">Ouvrir cet espace</button>
      <p class="duochat-note">Le dernier profil choisi est mémorisé, mais son mot de passe sera redemandé après la fermeture du navigateur.</p>
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
      span.textContent = id === snapshot.activeProfileId ? "Dernier profil utilisé" : `Espace ${id}`;
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
        snapshot = await send({
          type: "UNLOCK",
          profileId: selectedId,
          password: form.elements.password.value
        });
        await evaluateRoute(true);
      } catch (loginError) {
        error.textContent = friendlyError(loginError.message);
        submit.disabled = false;
        form.elements.password.select();
      }
    });
    requestAnimationFrame(() => form.elements.password.focus());
  }

  function showBlocked(ownerId, entityType = "conversation") {
    document.documentElement.classList.add("duochat-pending");
    const isProject = entityType === "project";
    shieldBrowserTitle(isProject ? "DuoChat — Projet protégé" : "DuoChat — Discussion protégée");
    const ownerName = snapshot.profiles[ownerId] ? snapshot.profiles[ownerId].name : `Utilisateur ${ownerId}`;
    const panel = gateShell(
      isProject ? "Projet protégé" : "Discussion protégée",
      isProject
        ? `Ce projet appartient à ${ownerName}. Son nom et ses discussions restent masqués.`
        : `Cette discussion appartient à ${ownerName}. Son contenu reste masqué.`
    );
    const actions = document.createElement("div");
    actions.className = "duochat-actions";
    const back = document.createElement("button");
    back.className = "duochat-button duochat-button-primary";
    back.textContent = "Retour à l’accueil";
    back.addEventListener("click", () => location.assign(homeUrl));
    const change = document.createElement("button");
    change.className = "duochat-button duochat-button-secondary";
    change.textContent = `Se connecter comme ${ownerName}`;
    change.addEventListener("click", () => showLogin(ownerId));
    actions.append(back, change);
    panel.appendChild(actions);
  }

  function showUnassigned(entityType, entityId) {
    document.documentElement.classList.add("duochat-pending");
    const isProject = entityType === "project";
    shieldBrowserTitle(isProject ? "DuoChat — Projet non attribué" : "DuoChat — Discussion non attribuée");
    const activeName = snapshot.profiles[snapshot.activeProfileId].name;
    const panel = gateShell(
      isProject ? "Projet non attribué" : "Discussion non attribuée",
      `${isProject ? "Ce projet existait" : "Cette discussion existait"} probablement avant l’installation. ${isProject ? "Il reste masqué" : "Elle reste masquée"} jusqu’à ce que tu choisisses son propriétaire.`
    );
    const error = document.createElement("p");
    error.className = "duochat-error";
    error.setAttribute("role", "alert");
    const actions = document.createElement("div");
    actions.className = "duochat-actions";
    const claim = document.createElement("button");
    claim.className = "duochat-button duochat-button-primary";
    claim.textContent = `Attribuer à ${activeName}`;
    claim.addEventListener("click", async () => {
      claim.disabled = true;
      try {
        snapshot = await send(
          isProject
            ? { type: "CLAIM_PROJECT", projectId: entityId }
            : { type: "CLAIM_CONVERSATION", conversationId: entityId }
        );
        await evaluateRoute(true);
      } catch (claimError) {
        error.textContent = friendlyError(claimError.message);
        claim.disabled = false;
      }
    });
    const back = document.createElement("button");
    back.className = "duochat-button duochat-button-secondary";
    back.textContent = "Ne pas ouvrir";
    back.addEventListener("click", () => location.assign(homeUrl));
    actions.append(claim, back);
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

  function setLinkVisibility(link, visible, recoverable = false) {
    if (visible) {
      link.removeAttribute("data-duochat-hidden");
      if (recoverable) link.setAttribute("data-duochat-unassigned", "true");
      else link.removeAttribute("data-duochat-unassigned");
    } else {
      link.setAttribute("data-duochat-hidden", "true");
      link.removeAttribute("data-duochat-unassigned");
    }
  }

  function claimVisibleProjectChats(conversationIds) {
    if (projectChatClaimInFlight || conversationIds.length === 0) return;
    projectChatClaimInFlight = true;
    send({ type: "CLAIM_CONVERSATIONS", conversationIds })
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
        const projectIsRecoverable = !projectOwner && snapshot.recoveryMode;
        setLinkVisibility(link, projectIsOwn || projectIsRecoverable, projectIsRecoverable);
        if (!projectIsOwn) continue;
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
      const belongsToOpenProject = Boolean(
        !conversationOwner &&
        ((openProjectIsOwn && isLinkInsideOpenProject(link, openProjectId)) ||
          conversationProjectOwner === snapshot.activeProfileId)
      );
      const conversationIsRecoverable = !conversationOwner && snapshot.recoveryMode && !belongsToOpenProject;
      setLinkVisibility(
        link,
        conversationIsOwn || belongsToOpenProject || conversationIsRecoverable,
        conversationIsRecoverable
      );
      if (belongsToOpenProject) projectConversationIds.add(conversationId);
    }
    claimVisibleProjectChats([...projectConversationIds]);
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
        const createdFromOutsideProjects = !isInitial && previousProjectId === null;
        if (!createdFromOutsideProjects) {
          showUnassigned("project", projectId);
          return;
        }
        try {
          snapshot = await send({ type: "CLAIM_PROJECT", projectId });
          if (evaluationId !== routeEvaluationCount) return;
          projectOwner = snapshot.activeProfileId;
        } catch (_error) {
          snapshot = await send({ type: "GET_SNAPSHOT" });
          showUnassigned("project", projectId);
          return;
        }
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
        snapshot = await send({ type: "CLAIM_CONVERSATION", conversationId });
        if (evaluationId !== routeEvaluationCount) return;
        previousConversationId = conversationId;
        removeGateAndReveal();
        return;
      } catch (_error) {
        snapshot = await send({ type: "GET_SNAPSHOT" });
      }
    }
    showUnassigned("conversation", conversationId);
  }

  async function refresh() {
    try {
      snapshot = await send({ type: "GET_SNAPSHOT" });
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
          if (!snapshot.recoveryMode) {
            showUnassigned("project", projectId);
            return;
          }
          try {
            snapshot = await send({ type: "CLAIM_PROJECT", projectId });
            location.assign(link.href);
          } catch (_error) {
            showUnassigned("project", projectId);
          }
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
        if (!snapshot.recoveryMode && !isOwnedProjectChat) {
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
    if (message && message.type === "DUOCHAT_REFRESH") {
      document.documentElement.classList.add("duochat-pending");
      shieldBrowserTitle("DuoChat — Vérification");
      refresh();
    }
  });

  setInterval(handlePotentialNavigation, 500);
  refresh();
})();
