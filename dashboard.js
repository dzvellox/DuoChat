"use strict";

(function runDashboard() {
  const C = globalThis.DuoChatCore;
  const I = globalThis.DuoChatI18n;
  let language = "fr";
  let data = null;
  let page = "overview";
  let selected = new Set();
  let entityFilter = "";
  let collectionFilter = "all";

  const TEXT = {
    fr: {
      overview:"Vue d’ensemble", chats:"Discussions", projects:"Projets", rules:"Règles", profiles:"Profils", security:"Sécurité", backups:"Sauvegardes", settings:"Paramètres",
      lock:"Verrouiller", presentation:"Présentation", screenshot:"Capture", dashboard:"Dashboard", totalChats:"Discussions", totalProjects:"Projets", favorites:"Favoris", storage:"Stockage local", recent:"Activité récente", activeProfile:"Profil actif", quickModes:"Modes rapides", encrypted:"Chiffrement AES-256", enabled:"Activé", disabled:"Désactivé", profileStats:"Statistiques par profil",
      search:"Rechercher dans ce profil…", bulkAssign:"Attribuer la sélection", selectProfile:"Choisir un profil", noItems:"Aucun élément à afficher.", title:"Titre", owner:"Profil", tags:"Tags", folder:"Dossier", actions:"Actions", edit:"Modifier", note:"Note locale", alias:"Alias local", favorite:"Favori", hidden:"Masqué", extraLock:"PIN supplémentaire", save:"Enregistrer", cancel:"Annuler", open:"Ouvrir", selected:"sélectionné(s)",
      ruleHelp:"Les règles s’appliquent aux nouveaux éléments avant l’auto-attribution.", addRule:"Ajouter une règle", ruleType:"Type de règle", targetProfile:"Profil cible", priority:"Priorité", contains:"Le titre contient", site:"Site", project:"Projet", defaultNew:"Tous les nouveaux éléments", delete:"Supprimer",
      profileHelp:"Thème, sécurité, permissions et horaires sont indépendants par profil.", addProfile:"Ajouter un profil", name:"Nom", password:"Mot de passe", template:"Modèle", accent:"Couleur", avatar:"Avatar", role:"Rôle", admin:"Admin", member:"Membre", privacyBlur:"Privacy Blur", autoLock:"Verrouillage auto (min)", systemLock:"Verrouiller quand le PC se verrouille", simplified:"Interface simplifiée", stealth:"Stealth Mode", decoy:"Decoy Profile", temporary:"Profil temporaire", temporaryNone:"Permanent", temporarySession:"Jusqu’au redémarrage", temporaryHours:"X heures", hours:"Heures", schedule:"Planning d’accès", scheduleEnabled:"Limiter les horaires", start:"Début", end:"Fin", days:"Jours (0=dim…6=sam)", hiddenFunctions:"Fonctions masquées", domains:"Domaines externes autorisés", permissions:"Permissions", update:"Mettre à jour",
      activityLog:"Journal d’activité", securityLog:"Journal de sécurité", noLogs:"Aucune entrée.", time:"Heure", event:"Événement", detail:"Détail",
      backupHelp:"DuoChat conserve plusieurs instantanés locaux avant les changements importants.", restore:"Restaurer", restoreLatest:"Undo — restaurer le dernier état", noBackups:"Aucune sauvegarde locale.",
      globalSettings:"Paramètres globaux", autoAssign:"Auto-attribuer les nouveaux chats", promptUnassigned:"Demander pour les éléments anciens/non attribués", localBackups:"Sauvegardes locales automatiques", syncTabs:"Synchroniser tous les onglets/fenêtres", exportPortable:"Export chiffré .duochat", exportPassword:"Mot de passe du fichier", export:"Exporter", importPortable:"Importer un .duochat", import:"Importer", transfer:"Transfert sans serveur", generateCode:"Générer un code", copy:"Copier", encryptionMigration:"Activer le chiffrement complet", encryptionHelp:"Pour une installation mise à jour depuis 1.4, saisis une fois le mot de passe de chaque profil. DuoChat chiffrera ensuite les attributions, notes, tags, règles et journaux avec AES-256-GCM.", recoveryKey:"Clé de récupération", recoveryWarning:"Conserve cette clé hors de l’ordinateur. Elle n’est affichée qu’à la création/activation.", cleanup:"Nettoyage intelligent", analyze:"Analyser", fix:"Corriger automatiquement", language:"Langue", done:"Terminé", error:"Erreur", copied:"Copié", confirmRestore:"Restaurer cette sauvegarde ?", wrong:"Une erreur est survenue.",
      cleanupResult:"Résultat du nettoyage", orphan:"Orphelins", mismatches:"Incohérences projet/chat", unassigned:"Métadonnées sans attribution", commandPalette:"Ctrl+K ouvre la Command Palette sur ChatGPT/Claude.", shortcuts:"Raccourcis", shortcutHelp:"Alt+Maj+L verrouille, Alt+Maj+X déclenche Panic Lock, Alt+Maj+P ouvre le sélecteur de profil, Alt+Maj+S bascule Screenshot Mode. Chrome permet de les modifier dans chrome://extensions/shortcuts.", theme:"Thème", themeSystem:"Système", themeDark:"Sombre", themeLight:"Clair", focusMode:"Mode Focus", focusType:"Type de focus", focusValue:"Valeur du focus", focusProject:"Projet", focusTag:"Tag", focusFolder:"Dossier", focusFavorites:"Favoris uniquement", collections:"Collections intelligentes", collectionAll:"Tout", collectionFavorites:"Favoris", collectionWeek:"Cette semaine", collectionUnassigned:"Non attribués", smartMigration:"Smart Migration", smartMigrationHelp:"DuoChat propose des propriétaires probables à partir des projets, règles, titres et modèles de profils, sans lire le contenu des chats.", findSuggestions:"Chercher des suggestions", applySuggestions:"Appliquer les suggestions fiables", noSuggestions:"Aucune suggestion fiable.", localOnly:"Toutes ces données restent dans le stockage local de l’extension. Aucun serveur DuoChat n’est utilisé.", updateCenter:"Mises à jour GitHub", updateCurrent:"Version installée", updateLatest:"Dernière version", updateChannel:"Canal", updateStable:"Stable", updateBeta:"Beta", updateCheck:"Vérifier maintenant", updateDownload:"Télécharger la mise à jour", updateOpenRelease:"Voir la release GitHub", updateReady:"Une nouvelle version est disponible.", updateCurrentOk:"DuoChat est à jour.", updateChecking:"Vérification de GitHub…", updateNever:"Pas encore vérifié", updateManualHelp:"Installation développeur : DuoChat télécharge le ZIP depuis GitHub, mais Chrome ne permet pas à une extension non empaquetée de s’auto-remplacer. Extrais le ZIP par-dessus le même dossier DuoChat puis clique sur Reload dans chrome://extensions. Tes données chrome.storage restent locales.", updatePublicRepo:"Le contrôle automatique fonctionne pour les utilisateurs lorsque le dépôt GitHub est public.", updateError:"Impossible de vérifier les mises à jour GitHub."
    },
    en: {
      overview:"Overview", chats:"Chats", projects:"Projects", rules:"Rules", profiles:"Profiles", security:"Security", backups:"Backups", settings:"Settings", lock:"Lock", presentation:"Presentation", screenshot:"Screenshot", dashboard:"Dashboard", totalChats:"Chats", totalProjects:"Projects", favorites:"Favorites", storage:"Local storage", recent:"Recent activity", activeProfile:"Active profile", quickModes:"Quick modes", encrypted:"AES-256 encryption", enabled:"Enabled", disabled:"Disabled", profileStats:"Stats by profile", search:"Search this profile…", bulkAssign:"Assign selection", selectProfile:"Choose a profile", noItems:"No items to display.", title:"Title", owner:"Profile", tags:"Tags", folder:"Folder", actions:"Actions", edit:"Edit", note:"Local note", alias:"Local alias", favorite:"Favorite", hidden:"Hidden", extraLock:"Extra PIN", save:"Save", cancel:"Cancel", open:"Open", selected:"selected", ruleHelp:"Rules apply to new items before auto-assignment.", addRule:"Add rule", ruleType:"Rule type", targetProfile:"Target profile", priority:"Priority", contains:"Title contains", site:"Site", project:"Project", defaultNew:"All new items", delete:"Delete", profileHelp:"Theme, security, permissions and schedule are independent for each profile.", addProfile:"Add profile", name:"Name", password:"Password", template:"Template", accent:"Accent", avatar:"Avatar", role:"Role", admin:"Admin", member:"Member", privacyBlur:"Privacy Blur", autoLock:"Auto-lock (min)", systemLock:"Lock when computer locks", simplified:"Simplified interface", stealth:"Stealth Mode", decoy:"Decoy Profile", temporary:"Temporary profile", temporaryNone:"Permanent", temporarySession:"Until restart", temporaryHours:"X hours", hours:"Hours", schedule:"Access schedule", scheduleEnabled:"Restrict schedule", start:"Start", end:"End", days:"Days (0=Sun…6=Sat)", hiddenFunctions:"Hidden features", domains:"Allowed external domains", permissions:"Permissions", update:"Update", activityLog:"Activity log", securityLog:"Security log", noLogs:"No entries.", time:"Time", event:"Event", detail:"Detail", backupHelp:"DuoChat keeps several local snapshots before important changes.", restore:"Restore", restoreLatest:"Undo — restore latest state", noBackups:"No local backup.", globalSettings:"Global settings", autoAssign:"Auto-assign new chats", promptUnassigned:"Prompt for old/unassigned items", localBackups:"Automatic local backups", syncTabs:"Sync all tabs/windows", exportPortable:"Encrypted .duochat export", exportPassword:"File password", export:"Export", importPortable:"Import a .duochat", import:"Import", transfer:"Serverless transfer", generateCode:"Generate code", copy:"Copy", encryptionMigration:"Enable full encryption", encryptionHelp:"For an install upgraded from 1.4, enter each profile password once. DuoChat will then encrypt assignments, notes, tags, rules and logs with AES-256-GCM.", recoveryKey:"Recovery key", recoveryWarning:"Store this key away from this computer. It is only shown when created/enabled.", cleanup:"Smart cleanup", analyze:"Analyze", fix:"Fix automatically", language:"Language", done:"Done", error:"Error", copied:"Copied", confirmRestore:"Restore this backup?", wrong:"Something went wrong.", cleanupResult:"Cleanup result", orphan:"Orphans", mismatches:"Project/chat mismatches", unassigned:"Unassigned metadata", commandPalette:"Ctrl+K opens the Command Palette on ChatGPT/Claude.", shortcuts:"Shortcuts", shortcutHelp:"Alt+Shift+L locks, Alt+Shift+X triggers Panic Lock, Alt+Shift+P opens the profile picker, Alt+Shift+S toggles Screenshot Mode. Chrome lets you change them at chrome://extensions/shortcuts.", theme:"Theme", themeSystem:"System", themeDark:"Dark", themeLight:"Light", focusMode:"Focus Mode", focusType:"Focus type", focusValue:"Focus value", focusProject:"Project", focusTag:"Tag", focusFolder:"Folder", focusFavorites:"Favorites only", collections:"Smart collections", collectionAll:"All", collectionFavorites:"Favorites", collectionWeek:"This week", collectionUnassigned:"Unassigned", smartMigration:"Smart Migration", smartMigrationHelp:"DuoChat suggests likely owners from projects, rules, titles and profile templates without reading chat content.", findSuggestions:"Find suggestions", applySuggestions:"Apply reliable suggestions", noSuggestions:"No reliable suggestions.", localOnly:"All of this data stays in the extension's local storage. DuoChat uses no server.", updateCenter:"GitHub updates", updateCurrent:"Installed version", updateLatest:"Latest version", updateChannel:"Channel", updateStable:"Stable", updateBeta:"Beta", updateCheck:"Check now", updateDownload:"Download update", updateOpenRelease:"Open GitHub release", updateReady:"A new version is available.", updateCurrentOk:"DuoChat is up to date.", updateChecking:"Checking GitHub…", updateNever:"Not checked yet", updateManualHelp:"Developer install: DuoChat can download the ZIP from GitHub, but Chrome does not allow an unpacked extension to replace itself. Extract the ZIP over the same DuoChat folder, then click Reload in chrome://extensions. Your chrome.storage data stays local.", updatePublicRepo:"Automatic checks work for users once the GitHub repository is public.", updateError:"Unable to check GitHub for updates."
    }
  };
  const SHORT = {
    es:{overview:"Resumen",chats:"Chats",projects:"Proyectos",rules:"Reglas",profiles:"Perfiles",security:"Seguridad",backups:"Copias",settings:"Ajustes",lock:"Bloquear",presentation:"Presentación",screenshot:"Captura",search:"Buscar en este perfil…",save:"Guardar",cancel:"Cancelar",delete:"Eliminar",edit:"Editar",open:"Abrir",language:"Idioma",done:"Hecho",error:"Error",copied:"Copiado"},
    de:{overview:"Übersicht",chats:"Chats",projects:"Projekte",rules:"Regeln",profiles:"Profile",security:"Sicherheit",backups:"Backups",settings:"Einstellungen",lock:"Sperren",presentation:"Präsentation",screenshot:"Screenshot",search:"In diesem Profil suchen…",save:"Speichern",cancel:"Abbrechen",delete:"Löschen",edit:"Bearbeiten",open:"Öffnen",language:"Sprache",done:"Fertig",error:"Fehler",copied:"Kopiert"},
    it:{overview:"Panoramica",chats:"Chat",projects:"Progetti",rules:"Regole",profiles:"Profili",security:"Sicurezza",backups:"Backup",settings:"Impostazioni",lock:"Blocca",presentation:"Presentazione",screenshot:"Schermata",search:"Cerca in questo profilo…",save:"Salva",cancel:"Annulla",delete:"Elimina",edit:"Modifica",open:"Apri",language:"Lingua",done:"Fatto",error:"Errore",copied:"Copiato"},
    pt:{overview:"Visão geral",chats:"Conversas",projects:"Projetos",rules:"Regras",profiles:"Perfis",security:"Segurança",backups:"Cópias",settings:"Definições",lock:"Bloquear",presentation:"Apresentação",screenshot:"Captura",search:"Pesquisar neste perfil…",save:"Guardar",cancel:"Cancelar",delete:"Eliminar",edit:"Editar",open:"Abrir",language:"Idioma",done:"Concluído",error:"Erro",copied:"Copiado"}
  };

  function tr(key) {
    const full = TEXT[language] || TEXT.en;
    return (SHORT[language] && SHORT[language][key]) || full[key] || TEXT.en[key] || TEXT.fr[key] || key;
  }

  function bytesToBase64Url(bytes) { return C.bytesToBase64Url(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }

  async function registerActiveWebauthn() {
    if (!navigator.credentials || typeof navigator.credentials.create !== "function") throw new Error("WEBAUTHN_UNAVAILABLE");
    const active = data.profiles.find((p)=>p.id===data.activeProfileId);
    if (!active) throw new Error("INVALID_PROFILE");
    const begin = await send({type:"BEGIN_WEBAUTHN_REGISTRATION",profileId:active.id});
    const credential = await navigator.credentials.create({publicKey:{
      challenge:C.base64UrlToBytes(begin.challenge),rp:{name:"DuoChat"},
      user:{id:C.base64UrlToBytes(begin.userId),name:`duochat:${active.id}`,displayName:active.name},
      pubKeyCredParams:[{type:"public-key",alg:-7}],authenticatorSelection:{userVerification:"required",residentKey:"discouraged"},timeout:60000,attestation:"none"
    }});
    if(!credential||!credential.response||typeof credential.response.getPublicKey!=="function") throw new Error("WEBAUTHN_PUBLIC_KEY_UNAVAILABLE");
    const pk=credential.response.getPublicKey(); const alg=typeof credential.response.getPublicKeyAlgorithm==="function"?credential.response.getPublicKeyAlgorithm():-7;
    if(!pk||alg!==-7) throw new Error("UNSUPPORTED_WEBAUTHN_CREDENTIAL");
    await send({type:"FINISH_WEBAUTHN_REGISTRATION",credentialId:bytesToBase64Url(new Uint8Array(credential.rawId)),clientDataJSON:bytesToBase64Url(new Uint8Array(credential.response.clientDataJSON)),publicKeySpki:C.bytesToBase64(new Uint8Array(pk)),algorithm:alg});
    await reload(false);
  }

  function renderQr(code) {
    const box=document.getElementById("transfer-qr"), help=document.getElementById("transfer-qr-help");
    if(!box||!help||!globalThis.DuoChatQR)return;
    box.replaceChildren();box.hidden=true;
    const bytes=new TextEncoder().encode(String(code||"")).length;
    if(!code){help.textContent="";return;}
    if(bytes>globalThis.DuoChatQR.maxRecommendedBytes){help.textContent="Code trop volumineux pour un QR fiable : utilise le fichier chiffré .duochat.";return;}
    try{globalThis.DuoChatQR.render(box,code,{size:280,level:"L"});box.hidden=false;help.textContent="QR généré entièrement en local. Aucun serveur DuoChat n’est contacté.";}catch(_e){help.textContent="QR impossible pour cette taille : utilise le fichier .duochat.";}
  }


  let encryptedQrChunks=[];
  let encryptedQrIndex=0;
  function qrChecksum(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,"0");}
  function makeEncryptedQrChunks(content,maxPayload=1400){
    const text=String(content||""); const hash=qrChecksum(text); const total=Math.max(1,Math.ceil(text.length/maxPayload));
    return Array.from({length:total},(_,i)=>`DUOCHATQR1|${i+1}|${total}|${hash}|${text.slice(i*maxPayload,(i+1)*maxPayload)}`);
  }
  function parseEncryptedQrChunks(text){
    const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length) throw new Error("QR_CHUNKS_REQUIRED");
    const map=new Map(); let total=null,hash=null;
    for(const line of lines){const m=/^DUOCHATQR1\|(\d+)\|(\d+)\|([0-9a-f]{8})\|([\s\S]*)$/i.exec(line);if(!m)continue;const index=Number(m[1]),t=Number(m[2]);if(!total){total=t;hash=m[3].toLowerCase();}if(t!==total||m[3].toLowerCase()!==hash)throw new Error("QR_CHUNKS_MISMATCH");map.set(index,m[4]);}
    if(!total||map.size!==total) throw new Error(`QR_CHUNKS_INCOMPLETE:${map.size}/${total||"?"}`);
    let content="";for(let i=1;i<=total;i++){if(!map.has(i))throw new Error(`QR_CHUNK_MISSING:${i}`);content+=map.get(i);}if(qrChecksum(content)!==hash)throw new Error("QR_CHUNKS_CHECKSUM");return content;
  }
  function renderEncryptedQrPage(){
    const box=document.getElementById("encrypted-transfer-qr"),label=document.getElementById("encrypted-qr-index"),prev=document.getElementById("encrypted-qr-prev"),next=document.getElementById("encrypted-qr-next");
    if(!box||!label)return;box.replaceChildren();
    if(!encryptedQrChunks.length){box.hidden=true;label.textContent="";return;}
    box.hidden=false;globalThis.DuoChatQR.render(box,encryptedQrChunks[encryptedQrIndex],{size:300,level:"L"});label.textContent=`QR ${encryptedQrIndex+1} / ${encryptedQrChunks.length}`;if(prev)prev.disabled=encryptedQrIndex<=0;if(next)next.disabled=encryptedQrIndex>=encryptedQrChunks.length-1;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || !response.ok) return reject(new Error((response && response.error) || "EXTENSION_UNAVAILABLE"));
        resolve(response.data);
      });
    });
  }

  function flash(text, isError = false) {
    const node = document.getElementById("flash");
    node.textContent = text;
    node.hidden = false;
    node.style.background = isError ? "var(--danger)" : "var(--text)";
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { node.hidden = true; }, 3600);
  }

  function profileName(id) {
    const profile = data && data.profiles.find((item) => item.id === id);
    return profile ? profile.name : id;
  }

  function activeProfile() {
    return data && data.profiles.find((item) => item.id === data.activeProfileId);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(2)} MB`;
  }

  function applyChrome() {
    const active = activeProfile();
    if (active) {
      document.documentElement.style.setProperty("--accent", active.accent || "#7667F5");
      const settings = data.profileSettings && data.profileSettings[active.id];
      document.documentElement.dataset.theme = settings && ["light","dark"].includes(settings.theme) ? settings.theme : "system";
      document.getElementById("sidebar-profile").innerHTML = `<span class="avatar">${esc(active.avatar || active.name.slice(0,1).toUpperCase())}</span><div><strong>${esc(active.name)}</strong><small>${esc(active.role)}</small></div>`;
    }
    document.getElementById("presentation-toggle").setAttribute("aria-pressed", String(Boolean(data && data.snapshot.presentationMode)));
    document.getElementById("screenshot-toggle").setAttribute("aria-pressed", String(Boolean(data && data.snapshot.screenshotMode)));
    for (const node of document.querySelectorAll("[data-t]")) node.textContent = tr(node.dataset.t);
  }

  const NAV = [
    ["overview","⌂"],["chats","💬"],["projects","▦"],["rules","⚡"],["profiles","👥"],["security","🛡"],["backups","↶"],["settings","⚙"]
  ];

  function renderNav() {
    const nav = document.getElementById("nav");
    nav.replaceChildren();
    for (const [id, icon] of NAV) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<b>${icon}</b><span>${esc(tr(id))}</span>`;
      if (id === page) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => { page = id; selected.clear(); render(); });
      nav.appendChild(button);
    }
  }

  function pageHeader(title) {
    document.getElementById("page-title").textContent = title;
    document.getElementById("eyebrow").textContent = `DuoChat · ${profileName(data.activeProfileId)}`;
  }

  function renderOverview() {
    pageHeader(tr("overview"));
    const stats = data.stats[data.activeProfileId] || { conversations:0, projects:0, favorites:0, recent:0 };
    const totalChats = Object.values(data.stats).reduce((sum, s) => sum + s.conversations, 0);
    const totalProjects = Object.values(data.stats).reduce((sum, s) => sum + s.projects, 0);
    document.getElementById("page").innerHTML = `
      <div class="grid stats">
        <article class="card stat"><span>${esc(tr("totalChats"))}</span><strong>${stats.conversations}</strong><small class="muted">${data.isAdmin ? `${totalChats} total` : tr("activeProfile")}</small></article>
        <article class="card stat"><span>${esc(tr("totalProjects"))}</span><strong>${stats.projects}</strong><small class="muted">${data.isAdmin ? `${totalProjects} total` : tr("activeProfile")}</small></article>
        <article class="card stat"><span>${esc(tr("favorites"))}</span><strong>${stats.favorites}</strong><small class="muted">${stats.recent} · 7j</small></article>
        <article class="card stat"><span>${esc(tr("storage"))}</span><strong>${esc(formatBytes(data.storageBytes))}</strong><small class="muted">${data.snapshot.encrypted ? tr("enabled") : tr("disabled")}</small></article>
      </div>
      <div class="grid two" style="margin-top:16px">
        <article class="card"><h2>${esc(tr("profileStats"))}</h2><div class="grid">${data.profiles.map((p) => {
          const s = data.stats[p.id] || {};
          return `<div class="profile-head"><div style="display:flex;align-items:center;gap:10px"><span class="avatar" style="background:${esc(p.accent)}">${esc(p.avatar || p.name.slice(0,1))}</span><div><strong>${esc(p.name)}</strong><div class="muted small">${s.conversations || 0} chats · ${s.projects || 0} projets</div></div></div><span class="badge ${p.role === 'admin' ? 'admin':''}">${esc(p.role)}</span></div>`;
        }).join("")}</div></article>
        <article class="card"><h2>${esc(tr("quickModes"))}</h2><div class="grid"><div class="profile-head"><span>${esc(tr("encrypted"))}</span><span class="badge ${data.snapshot.encrypted ? 'admin':''}">${esc(data.snapshot.encrypted ? tr("enabled") : tr("disabled"))}</span></div><div class="profile-head"><span>Privacy Blur</span><span class="badge">${data.snapshot.activeSettings && data.snapshot.activeSettings.privacyBlur ? tr("enabled") : tr("disabled")}</span></div><div class="profile-head"><span>Command Palette</span><span class="badge">Ctrl+K</span></div><p class="muted">${esc(tr("commandPalette"))}</p></div></article>
      </div>
      <article class="card" style="margin-top:16px"><h2>${esc(tr("recent"))}</h2>${renderLogs(data.activityLog.slice(0,8))}</article>
      <article class="card support-card" style="margin-top:16px">
        <div class="profile-head"><div><h2 style="margin:0">${esc(I.t(language,"supportTitle"))}</h2><p class="muted" style="margin-bottom:0">${esc(I.t(language,"supportLead"))}</p></div><button id="support-duochat-dashboard" class="primary" type="button">${esc(I.t(language,"supportCookie"))}</button></div>
      </article>`;
    document.getElementById("support-duochat-dashboard")?.addEventListener("click", async () => { try { await send({ type:"OPEN_SUPPORT" }); } catch (error) { flash(error.message,true); } });
  }

  function entityDisplayTitle(item) {
    return item.alias || item.title || item.id;
  }

  function entityHref(item, kind) {
    return C.sanitizeEntityUrl(item && item.url, kind, item && item.id) || "";
  }

  function matchesFilter(item) {
    if (!entityFilter) return true;
    const hay = [item.id,item.title,item.alias,item.note,item.folder,...(item.tags || [])].join(" ").toLowerCase();
    return hay.includes(entityFilter.toLowerCase());
  }

  function renderEntityPage(kind) {
    const isChat = kind === "conversation";
    const sourceItems = (isChat ? data.conversations : data.projects);
    const items = sourceItems.filter((item) => {
      if (!matchesFilter(item)) return false;
      if (collectionFilter === "favorites") return item.favorite === true;
      if (collectionFilter === "week") return Number(item.lastSeenAt || item.createdAt || 0) >= Date.now() - 7 * 86400000;
      if (collectionFilter === "unassigned") return !item.ownerId;
      return true;
    });
    pageHeader(isChat ? tr("chats") : tr("projects"));
    const ownerOptions = data.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    document.getElementById("page").innerHTML = `
      <article class="card">
        <div class="toolbar">
          <input id="entity-search" class="grow" type="search" value="${esc(entityFilter)}" placeholder="${esc(tr("search"))}">
          <select id="collection-filter" style="width:auto"><option value="all" ${collectionFilter==='all'?'selected':''}>${esc(tr("collectionAll"))}</option><option value="favorites" ${collectionFilter==='favorites'?'selected':''}>${esc(tr("collectionFavorites"))}</option><option value="week" ${collectionFilter==='week'?'selected':''}>${esc(tr("collectionWeek"))}</option>${data.isAdmin?`<option value="unassigned" ${collectionFilter==='unassigned'?'selected':''}>${esc(tr("collectionUnassigned"))}</option>`:""}</select>
          ${data.isAdmin ? `<select id="bulk-profile" style="width:auto"><option value="">${esc(tr("selectProfile"))}</option>${ownerOptions}</select><button id="bulk-assign" class="secondary" type="button">${esc(tr("bulkAssign"))} (<span id="selected-count">${selected.size}</span>)</button>` : ""}
        </div>
        ${items.length ? `<div class="table-wrap"><table><thead><tr><th><input id="select-all" type="checkbox"></th><th>${esc(tr("title"))}</th><th>${esc(tr("owner"))}</th><th>${esc(tr("tags"))}</th><th>${esc(tr("folder"))}</th><th>${esc(tr("actions"))}</th></tr></thead><tbody>${items.map((item) => `<tr><td><input class="entity-check" data-id="${esc(item.id)}" type="checkbox" ${selected.has(item.id) ? "checked":""}></td><td><div class="entity-title">${esc(entityDisplayTitle(item))}</div><div class="muted small">${esc(item.id)}</div></td><td>${esc(item.ownerId ? profileName(item.ownerId) : tr("collectionUnassigned"))}</td><td><div class="tags">${(item.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div></td><td>${esc(item.folder || "—")}</td><td><div class="toolbar" style="margin:0"><button class="icon-btn favorite ${item.favorite ? "active":""}" data-id="${esc(item.id)}" title="${esc(tr("favorite"))}" type="button">★</button><button class="icon-btn edit-entity" data-id="${esc(item.id)}" type="button" title="${esc(tr("edit"))}">✎</button>${entityHref(item,kind) ? `<a class="icon-btn" style="display:grid;place-items:center;text-decoration:none" href="${esc(entityHref(item,kind))}" target="_blank" rel="noopener noreferrer" title="${esc(tr("open"))}">↗</a>`:""}</div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">${esc(tr("noItems"))}</div>`}
      </article>
      <div id="entity-editor" style="margin-top:16px"></div>`;

    const search = document.getElementById("entity-search");
    search.addEventListener("input", () => { entityFilter = search.value; renderEntityPage(kind); });
    document.getElementById("collection-filter").addEventListener("change", (event) => { collectionFilter = event.currentTarget.value; renderEntityPage(kind); });
    document.querySelectorAll(".entity-check").forEach((box) => box.addEventListener("change", () => {
      if (box.checked) selected.add(box.dataset.id); else selected.delete(box.dataset.id);
      const count = document.getElementById("selected-count"); if (count) count.textContent = selected.size;
    }));
    document.getElementById("select-all")?.addEventListener("change", (event) => {
      for (const item of items) event.currentTarget.checked ? selected.add(item.id) : selected.delete(item.id);
      renderEntityPage(kind);
    });
    document.querySelectorAll(".favorite").forEach((button) => button.addEventListener("click", async () => {
      const item = items.find((entry) => entry.id === button.dataset.id);
      try { await send({ type:"UPSERT_ENTITY_META", entityType:kind, entityId:item.id, patch:{ favorite: !item.favorite } }); await reload(false); renderEntityPage(kind); } catch (e) { flash(e.message,true); }
    }));
    document.querySelectorAll(".edit-entity").forEach((button) => button.addEventListener("click", () => openEntityEditor(kind, items.find((entry) => entry.id === button.dataset.id))));
    document.getElementById("bulk-assign")?.addEventListener("click", async () => {
      const target = document.getElementById("bulk-profile").value;
      if (!target || !selected.size) return;
      const payload = { type:"BULK_ASSIGN", targetProfileId:target, conversationIds:[], projectIds:[] };
      for (const id of selected) (isChat ? payload.conversationIds : payload.projectIds).push(id);
      try { await send(payload); selected.clear(); flash(tr("done")); await reload(false); renderEntityPage(kind); } catch (e) { flash(e.message,true); }
    });
  }

  function openEntityEditor(kind, item) {
    if (!item) return;
    const host = document.getElementById("entity-editor");
    host.innerHTML = `<article class="card"><h2>${esc(tr("edit"))} — ${esc(entityDisplayTitle(item))}</h2><form id="edit-entity-form" class="form-grid">
      <div class="field"><label>${esc(tr("alias"))}</label><input name="alias" value="${esc(item.alias || "")}"></div>
      <div class="field"><label>${esc(tr("folder"))}</label><input name="folder" value="${esc(item.folder || "")}"></div>
      <div class="field full"><label>${esc(tr("tags"))}</label><input name="tags" value="${esc((item.tags || []).join(", "))}"></div>
      <div class="field full"><label>${esc(tr("note"))}</label><textarea name="note">${esc(item.note || "")}</textarea></div>
      <div class="checks full"><label class="check"><input name="favorite" type="checkbox" ${item.favorite ? "checked":""}> ${esc(tr("favorite"))}</label><label class="check"><input name="extraLock" type="checkbox" ${item.extraLock ? "checked":""}> ${esc(tr("extraLock"))}</label><label class="check"><input name="hidden" type="checkbox" ${item.hidden ? "checked":""}> ${esc(tr("hidden"))}</label></div>
      <div class="field full"><label>PIN supplémentaire (6 caractères minimum)</label><input name="extraPin" type="password" minlength="6" placeholder="${item.extraLock?'Laisser vide pour conserver le PIN actuel':'Requis si le verrou supplémentaire est activé'}"></div>
      <div class="toolbar full"><button class="primary" type="submit">${esc(tr("save"))}</button><button id="close-editor" class="secondary" type="button">${esc(tr("cancel"))}</button></div>
    </form></article>`;
    const form = document.getElementById("edit-entity-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const patch = { alias:form.elements.alias.value, folder:form.elements.folder.value, tags:form.elements.tags.value.split(",").map((x)=>x.trim()).filter(Boolean), note:form.elements.note.value, favorite:form.elements.favorite.checked, hidden:form.elements.hidden.checked };
      try {
        await send({ type:"UPSERT_ENTITY_META", entityType:kind, entityId:item.id, patch });
        const requestedLock=form.elements.extraLock.checked; const pin=form.elements.extraPin.value;
        if(requestedLock && (!item.extraLock || pin)) { if(pin.length<6) throw new Error("Le PIN supplémentaire doit contenir au moins 6 caractères."); await send({type:"SET_ENTITY_LOCK",entityId:item.id,enabled:true,pin}); }
        if(!requestedLock && item.extraLock) await send({type:"SET_ENTITY_LOCK",entityId:item.id,enabled:false});
        flash(tr("done")); await reload(false); renderEntityPage(kind);
      } catch (e) { flash(e.message,true); }
    });
    document.getElementById("close-editor").addEventListener("click", () => host.replaceChildren());
    host.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  function renderRules() {
    pageHeader(tr("rules"));
    if (!data.isAdmin) {
      document.getElementById("page").innerHTML = `<article class="card"><p class="muted">${esc(tr("ruleHelp"))}</p>${data.rules.map(ruleHtml).join("") || `<div class="empty">${esc(tr("noItems"))}</div>`}</article>`;
      return;
    }
    const profileOptions = data.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    document.getElementById("page").innerHTML = `<div class="grid two"><article class="card"><h2>${esc(tr("addRule"))}</h2><p class="muted">${esc(tr("ruleHelp"))}</p><form id="rule-form" class="form-grid"><div class="field"><label>${esc(tr("ruleType"))}</label><select name="type"><option value="project">${esc(tr("project"))}</option><option value="site">${esc(tr("site"))}</option><option value="title_contains">${esc(tr("contains"))}</option><option value="default_new">${esc(tr("defaultNew"))}</option></select></div><div class="field"><label>${esc(tr("targetProfile"))}</label><select name="profileId">${profileOptions}</select></div><div class="field"><label>Project ID</label><input name="projectId"></div><div class="field"><label>Site</label><select name="siteId"><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option></select></div><div class="field"><label>${esc(tr("contains"))}</label><input name="contains"></div><div class="field"><label>${esc(tr("priority"))}</label><input name="priority" type="number" value="0"></div><div class="full"><button class="primary" type="submit">${esc(tr("addRule"))}</button></div></form></article><article class="card"><h2>${esc(tr("rules"))}</h2><div id="rule-list" class="grid">${data.rules.map(ruleHtml).join("") || `<div class="empty">${esc(tr("noItems"))}</div>`}</div></article></div>`;
    document.getElementById("rule-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const f=event.currentTarget;
      try { await send({type:"ADD_RULE",rule:{type:f.elements.type.value,profileId:f.elements.profileId.value,projectId:f.elements.projectId.value,siteId:f.elements.siteId.value,contains:f.elements.contains.value,priority:Number(f.elements.priority.value)||0}}); flash(tr("done")); await reload(false); renderRules(); } catch(e){flash(e.message,true);}
    });
    bindRuleDeletes();
  }

  function ruleHtml(rule) {
    const detail = rule.type === "project" ? rule.projectId : rule.type === "site" ? rule.siteId : rule.type === "title_contains" ? rule.contains : "*";
    return `<div class="profile-head"><div><strong>${esc(rule.type)}</strong><div class="muted small">${esc(detail || "")} → ${esc(profileName(rule.profileId))} · P${esc(rule.priority)}</div></div>${data.isAdmin ? `<button class="icon-btn delete-rule" data-id="${esc(rule.id)}" title="${esc(tr("delete"))}">×</button>`:""}</div>`;
  }
  function bindRuleDeletes() { document.querySelectorAll(".delete-rule").forEach((b)=>b.addEventListener("click",async()=>{try{await send({type:"DELETE_RULE",ruleId:b.dataset.id});await reload(false);renderRules();}catch(e){flash(e.message,true);}})); }

  function renderProfiles() {
    pageHeader(tr("profiles"));
    const cards = data.profiles.map((profile) => profileCard(profile)).join("");
    const add = data.isAdmin ? `<article class="card"><h2>${esc(tr("addProfile"))}</h2><form id="add-profile-form" class="form-grid"><div class="field"><label>${esc(tr("name"))}</label><input name="name" required></div><div class="field"><label>${esc(tr("password"))}</label><input name="password" type="password" minlength="6" required></div><div class="field"><label>${esc(tr("template"))}</label><select name="template">${Object.values(C.PROFILE_TEMPLATES).map((t)=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></div><div class="field"><label>${esc(tr("accent"))}</label><input name="accent" type="color" value="#7667f5"></div><div class="field"><label>${esc(tr("temporary"))}</label><select name="temporaryMode"><option value="none">${esc(tr("temporaryNone"))}</option><option value="session">${esc(tr("temporarySession"))}</option><option value="hours">${esc(tr("temporaryHours"))}</option></select></div><div class="field"><label>${esc(tr("hours"))}</label><input name="temporaryHours" type="number" min="1" max="168" value="8"></div><div class="full"><button class="primary" type="submit">${esc(tr("addProfile"))}</button></div></form></article>` : "";
    document.getElementById("page").innerHTML = `<p class="muted">${esc(tr("profileHelp"))}</p><div class="grid two">${cards}${add}</div>`;
    document.querySelectorAll(".profile-settings-form").forEach((form) => bindProfileForm(form));
    document.getElementById("add-profile-form")?.addEventListener("submit", async (event) => { event.preventDefault(); const f=event.currentTarget; try{await send({type:"ADD_PROFILE",name:f.elements.name.value,password:f.elements.password.value,template:f.elements.template.value,accent:f.elements.accent.value,temporary:f.elements.temporaryMode.value==="session"?{mode:"session"}:f.elements.temporaryMode.value==="hours"?{mode:"hours",expiresAt:Date.now()+Math.max(1,Number(f.elements.temporaryHours.value)||8)*3600000}:null});flash(tr("done"));await reload(false);renderProfiles();}catch(e){flash(e.message,true);} });
  }

  function profileCard(profile) {
    const settings = data.profileSettings[profile.id] || {};
    const canEdit = data.isAdmin || profile.id === data.activeProfileId;
    const hidden = (settings.hiddenFunctions || []).join(", ");
    const domains = (settings.externalDomains || []).join(", ");
    const permissions = (settings.permissions || []).join(", ");
    const sched = profile.schedule || {enabled:false,days:[0,1,2,3,4,5,6],start:"00:00",end:"23:59"};
    return `<article class="card profile-card"><div class="profile-head"><div style="display:flex;align-items:center;gap:10px"><span class="avatar" style="background:${esc(profile.accent)}">${esc(profile.avatar || profile.name.slice(0,1))}</span><div><h2 style="margin:0">${esc(profile.name)}</h2><span class="profile-id">${esc(profile.id)}</span></div></div><span class="badge ${profile.role==='admin'?'admin':''}">${esc(profile.role)}</span></div>${canEdit ? `<form class="profile-settings-form form-grid" data-id="${esc(profile.id)}"><div class="field"><label>${esc(tr("name"))}</label><input name="name" value="${esc(profile.name)}"></div><div class="field"><label>${esc(tr("accent"))}</label><input name="accent" type="color" value="${esc(profile.accent)}"></div><div class="field"><label>${esc(tr("avatar"))}</label><input name="avatar" maxlength="4" value="${esc(profile.avatar || "")}"></div><div class="field"><label>${esc(tr("autoLock"))}</label><input name="autoLockMinutes" type="number" min="0" max="240" value="${esc(settings.autoLockMinutes == null ? 15 : settings.autoLockMinutes)}"></div><div class="field"><label>${esc(tr("theme"))}</label><select name="theme"><option value="system" ${settings.theme==='system'?'selected':''}>${esc(tr("themeSystem"))}</option><option value="dark" ${settings.theme==='dark'?'selected':''}>${esc(tr("themeDark"))}</option><option value="light" ${settings.theme==='light'?'selected':''}>${esc(tr("themeLight"))}</option></select></div><div class="field"><label>${esc(tr("language"))}</label><select name="language"><option value="">Global</option>${I.SUPPORTED_LANGUAGES.map((l)=>`<option value="${esc(l.id)}" ${settings.language===l.id?'selected':''}>${esc(l.nativeLabel)}</option>`).join("")}</select></div><div class="checks full"><label class="check"><input name="privacyBlur" type="checkbox" ${settings.privacyBlur?'checked':''}> ${esc(tr("privacyBlur"))}</label><label class="check"><input name="lockOnSystemLock" type="checkbox" ${settings.lockOnSystemLock!==false?'checked':''}> ${esc(tr("systemLock"))}</label><label class="check"><input name="simplified" type="checkbox" ${settings.simplified?'checked':''}> ${esc(tr("simplified"))}</label>${data.isAdmin?`<label class="check"><input name="stealth" type="checkbox" ${profile.stealth?'checked':''}> ${esc(tr("stealth"))}</label><label class="check"><input name="decoy" type="checkbox" ${profile.decoy?'checked':''}> ${esc(tr("decoy"))}</label>`:""}</div><div class="checks full"><label class="check"><input name="focusEnabled" type="checkbox" ${settings.focusMode&&settings.focusMode.enabled?'checked':''}> ${esc(tr("focusMode"))}</label></div><div class="field"><label>${esc(tr("focusType"))}</label><select name="focusType"><option value="project" ${settings.focusMode?.type==='project'?'selected':''}>${esc(tr("focusProject"))}</option><option value="tag" ${settings.focusMode?.type==='tag'?'selected':''}>${esc(tr("focusTag"))}</option><option value="folder" ${settings.focusMode?.type==='folder'?'selected':''}>${esc(tr("focusFolder"))}</option><option value="favorites" ${settings.focusMode?.type==='favorites'?'selected':''}>${esc(tr("focusFavorites"))}</option></select></div><div class="field"><label>${esc(tr("focusValue"))}</label><input name="focusValue" value="${esc(settings.focusMode?.value||'')}"></div><div class="field"><label>Command Palette</label><input name="shortcutPalette" value="${esc(settings.shortcuts?.palette||'Ctrl+K')}"></div><div class="field"><label>Panic</label><input name="shortcutPanic" value="${esc(settings.shortcuts?.panic||'Alt+Shift+X')}"></div><div class="field"><label>Verrouillage</label><input name="shortcutLock" value="${esc(settings.shortcuts?.lock||'Alt+Shift+L')}"></div><div class="field"><label>Présentation</label><input name="shortcutPresentation" value="${esc(settings.shortcuts?.presentation||'Alt+Shift+V')}"></div><div class="field"><label>Screenshot</label><input name="shortcutScreenshot" value="${esc(settings.shortcuts?.screenshot||'Alt+Shift+S')}"></div><div class="field full"><label>${esc(tr("hiddenFunctions"))}</label><input name="hiddenFunctions" value="${esc(hidden)}" placeholder="apps, gpts, settings, share, files, projects_create, external_links"></div><div class="field full"><label>${esc(tr("domains"))}</label><input name="domains" value="${esc(domains)}"></div>${data.isAdmin?`<div class="field"><label>${esc(tr("temporary"))}</label><select name="temporaryMode"><option value="none" ${!profile.temporary?'selected':''}>${esc(tr("temporaryNone"))}</option><option value="session" ${profile.temporary?.mode==='session'?'selected':''}>${esc(tr("temporarySession"))}</option><option value="hours" ${profile.temporary?.mode==='hours'?'selected':''}>${esc(tr("temporaryHours"))}</option></select></div><div class="field"><label>${esc(tr("hours"))}</label><input name="temporaryHours" type="number" min="1" max="168" value="${profile.temporary?.mode==='hours'&&profile.temporary.expiresAt?Math.max(1,Math.ceil((profile.temporary.expiresAt-Date.now())/3600000)):8}"></div><div class="field full"><label>${esc(tr("permissions"))}</label><input name="permissions" value="${esc(permissions)}"></div><div class="checks full"><label class="check"><input name="scheduleEnabled" type="checkbox" ${sched.enabled?'checked':''}> ${esc(tr("scheduleEnabled"))}</label></div><div class="field"><label>${esc(tr("start"))}</label><input name="scheduleStart" type="time" value="${esc(sched.start)}"></div><div class="field"><label>${esc(tr("end"))}</label><input name="scheduleEnd" type="time" value="${esc(sched.end)}"></div><div class="field full"><label>${esc(tr("days"))}</label><input name="scheduleDays" value="${esc((sched.days||[]).join(','))}"></div>`:""}<div class="full"><button class="primary" type="submit">${esc(tr("update"))}</button></div></form>`:""}</article>`;
  }

  function bindProfileForm(form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const id=form.dataset.id;
      const profilePatch={name:form.elements.name.value,avatar:form.elements.avatar.value,accent:form.elements.accent.value};
      if (form.elements.stealth) profilePatch.stealth=form.elements.stealth.checked;
      if (form.elements.decoy) profilePatch.decoy=form.elements.decoy.checked;
      if (form.elements.scheduleEnabled) profilePatch.schedule={enabled:form.elements.scheduleEnabled.checked,start:form.elements.scheduleStart.value,end:form.elements.scheduleEnd.value,days:form.elements.scheduleDays.value.split(',').map(Number)};
      if (form.elements.temporaryMode) profilePatch.temporary=form.elements.temporaryMode.value==="session"?{mode:"session"}:form.elements.temporaryMode.value==="hours"?{mode:"hours",expiresAt:Date.now()+Math.max(1,Number(form.elements.temporaryHours.value)||8)*3600000}:null;
      const settingsPatch={privacyBlur:form.elements.privacyBlur.checked,lockOnSystemLock:form.elements.lockOnSystemLock.checked,simplified:form.elements.simplified.checked,autoLockMinutes:Number(form.elements.autoLockMinutes.value)||0,theme:form.elements.theme.value,language:form.elements.language.value||null,focusMode:{enabled:form.elements.focusEnabled.checked,type:form.elements.focusType.value,value:form.elements.focusValue.value},accent:form.elements.accent.value,hiddenFunctions:form.elements.hiddenFunctions.value.split(',').map(x=>x.trim()).filter(Boolean),externalDomains:form.elements.domains.value.split(',').map(x=>x.trim()).filter(Boolean),shortcuts:{palette:form.elements.shortcutPalette.value,panic:form.elements.shortcutPanic.value,lock:form.elements.shortcutLock.value,presentation:form.elements.shortcutPresentation.value,screenshot:form.elements.shortcutScreenshot.value}};
      if (form.elements.permissions) settingsPatch.permissions=form.elements.permissions.value.split(',').map(x=>x.trim()).filter(Boolean);
      try { await send({type:"UPDATE_PROFILE",profileId:id,patch:profilePatch}); await send({type:"UPDATE_PROFILE_SETTINGS",profileId:id,patch:settingsPatch}); flash(tr("done")); await reload(false); renderProfiles(); } catch(e){flash(e.message,true);}
    });
  }

  function renderLogs(logs) {
    if (!logs || !logs.length) return `<div class="empty">${esc(tr("noLogs"))}</div>`;
    return `<div class="log">${logs.map((entry)=>`<div class="log-row"><time>${esc(new Date(entry.ts).toLocaleString())}</time><strong>${esc(entry.action)}</strong><span class="muted">${esc(entry.detail || entry.entityId || "")}</span></div>`).join("")}</div>`;
  }

  function renderSecurity() {
    pageHeader(tr("security"));
    const active=data.profiles.find((p)=>p.id===data.activeProfileId);
    const webauthn=Boolean(active&&active.webauthnEnabled);
    document.getElementById("page").innerHTML = `<div class="grid two"><article class="card"><h2>Windows Hello / WebAuthn</h2><p class="muted">${webauthn?'Actif : ce profil exige le mot de passe + une validation biométrique ou clé de sécurité.':'Facultatif : ajoute un second facteur matériel/local au profil actif.'}</p><div class="security-actions"><button id="webauthn-action" class="${webauthn?'danger':'primary'}" type="button">${webauthn?'Désactiver WebAuthn':'Activer WebAuthn'}</button><button id="logical-logout" class="secondary" type="button">Déconnexion logique DuoChat</button></div><p class="muted small">La déconnexion DuoChat verrouille uniquement DuoChat et ne déconnecte pas le compte ChatGPT/Claude.</p></article><article class="card"><h2>${esc(tr("securityLog"))}</h2>${renderLogs(data.securityLog)}</article><article class="card"><h2>${esc(tr("activityLog"))}</h2>${renderLogs(data.activityLog)}</article></div>`;
    document.getElementById("webauthn-action").addEventListener("click",async()=>{try{if(webauthn)await send({type:"DISABLE_WEBAUTHN"});else await registerActiveWebauthn();flash(tr("done"));await reload(false);renderSecurity();}catch(e){flash(e.message,true);}});
    document.getElementById("logical-logout").addEventListener("click",async()=>{await send({type:"LOGICAL_LOGOUT"});location.reload();});
  }

  function renderBackups() {
    pageHeader(tr("backups"));
    document.getElementById("page").innerHTML = `<article class="card"><h2>${esc(tr("backups"))}</h2><p class="muted">${esc(tr("backupHelp"))}</p><div class="toolbar"><button id="undo-latest" class="primary" type="button">↶ ${esc(tr("restoreLatest"))}</button></div>${data.backups.length ? `<div class="grid">${data.backups.map((b)=>`<div class="profile-head"><div><strong>${esc(b.label || 'backup')}</strong><div class="muted small">${esc(new Date(b.ts).toLocaleString())}</div></div><button class="secondary restore-backup" data-id="${esc(b.id)}" type="button">${esc(tr("restore"))}</button></div>`).join("")}</div>`:`<div class="empty">${esc(tr("noBackups"))}</div>`}</article>`;
    const restore = async (id) => { if (!confirm(tr("confirmRestore"))) return; try{await send({type:"RESTORE_BACKUP",backupId:id});flash(tr("done"));await reload(false);renderBackups();}catch(e){flash(e.message,true);} };
    document.getElementById("undo-latest").addEventListener("click",()=>restore(null));
    document.querySelectorAll(".restore-backup").forEach((b)=>b.addEventListener("click",()=>restore(b.dataset.id)));
  }


  function formatUpdateDate(value) {
    if (!value) return tr("updateNever");
    try { return new Date(value).toLocaleString(); } catch (_error) { return String(value); }
  }

  async function refreshUpdateCard(force=false) {
    const statusEl=document.getElementById("github-update-status");
    if (!statusEl) return;
    const currentEl=document.getElementById("github-current-version");
    const latestEl=document.getElementById("github-latest-version");
    const checkedEl=document.getElementById("github-update-checked");
    const notesEl=document.getElementById("github-update-notes");
    const downloadEl=document.getElementById("github-update-download");
    const openEl=document.getElementById("github-update-open");
    statusEl.textContent=tr("updateChecking");
    if (currentEl) currentEl.textContent=chrome.runtime.getManifest().version;
    try {
      const status=await send({type:force?"CHECK_GITHUB_UPDATE":"GET_UPDATE_STATUS"});
      if (!document.getElementById("github-update-status")) return;
      if (latestEl) latestEl.textContent=status.latestVersion || "—";
      if (checkedEl) checkedEl.textContent=formatUpdateDate(status.checkedAt);
      const channel=document.getElementById("github-update-channel"); if (channel) channel.value=status.channel || "stable";
      if (status.error) {
        statusEl.textContent=`${tr("updateError")} (${status.error})`;
        statusEl.className="muted small";
      } else if (status.updateAvailable) {
        statusEl.textContent=`${tr("updateReady")} ${status.latestVersion}`;
        statusEl.className="badge admin";
      } else {
        statusEl.textContent=tr("updateCurrentOk");
        statusEl.className="badge";
      }
      if (notesEl) notesEl.textContent=(status.notes || "").slice(0,1200) || (status.releaseName || "");
      if (downloadEl) downloadEl.disabled=!status.updateAvailable || !status.assetUrl;
      if (openEl) openEl.disabled=!status.releaseUrl;
    } catch (error) {
      statusEl.textContent=`${tr("updateError")} (${error.message})`;
      statusEl.className="muted small";
    }
  }

  function renderSettings() {
    pageHeader(tr("settings"));
    const languageOptions = I.SUPPORTED_LANGUAGES.map((l)=>`<option value="${esc(l.id)}" ${l.id===language?'selected':''}>${esc(l.nativeLabel)}</option>`).join("");
    const passwordFields = data.snapshot.migrationNeedsEncryption ? data.profiles.map((p)=>`<div class="field"><label>${esc(p.name)}</label><input name="pw_${esc(p.id)}" type="password" minlength="6" required></div>`).join("") : "";
    document.getElementById("page").innerHTML = `<div class="grid two">
      <article class="card"><h2>${esc(tr("globalSettings"))}</h2><form id="global-form" class="grid"><label class="check"><input name="autoAssignNew" type="checkbox" ${data.globalSettings.autoAssignNew!==false?'checked':''}> ${esc(tr("autoAssign"))}</label><label class="check"><input name="promptUnassigned" type="checkbox" ${data.globalSettings.promptUnassigned!==false?'checked':''}> ${esc(tr("promptUnassigned"))}</label><label class="check"><input name="localBackups" type="checkbox" ${data.globalSettings.localBackups!==false?'checked':''}> ${esc(tr("localBackups"))}</label><label class="check"><input name="syncAllTabs" type="checkbox" ${data.globalSettings.syncAllTabs!==false?'checked':''}> ${esc(tr("syncTabs"))}</label>${data.isAdmin?`<button class="primary" type="submit">${esc(tr("save"))}</button>`:""}</form><hr><div class="field"><label>${esc(tr("language"))}</label><select id="language-select">${languageOptions}</select></div></article>
      <article class="card"><h2>${esc(tr("cleanup"))}</h2><p class="muted">${esc(tr("localOnly"))}</p><div class="toolbar"><button id="cleanup-analyze" class="secondary" type="button">${esc(tr("analyze"))}</button>${data.isAdmin?`<button id="cleanup-fix" class="primary" type="button">${esc(tr("fix"))}</button>`:""}</div><pre id="cleanup-output" class="code" style="min-height:80px">—</pre></article>
      ${data.isAdmin?`<article class="card"><h2>${esc(tr("smartMigration"))}</h2><p class="muted">${esc(tr("smartMigrationHelp"))}</p><div class="toolbar"><button id="smart-migration-find" class="secondary" type="button">${esc(tr("findSuggestions"))}</button><button id="smart-migration-apply" class="primary" type="button" disabled>${esc(tr("applySuggestions"))}</button></div><div id="smart-migration-output" class="grid"></div></article>`:""}
      <article class="card"><h2>${esc(tr("exportPortable"))}</h2><div class="field"><label>${esc(tr("exportPassword"))}</label><input id="export-password" type="password" minlength="6"></div><div class="toolbar" style="margin-top:10px"><button id="export-file" class="primary" type="button">${esc(tr("export"))}</button></div><hr><h3>${esc(tr("importPortable"))}</h3><div class="field"><input id="import-file" type="file" accept=".duochat,application/json"></div><div class="field"><label>${esc(tr("exportPassword"))}</label><input id="import-password" type="password" minlength="6"></div><button id="import-file-button" class="secondary" type="button">${esc(tr("import"))}</button></article>
      <article class="card"><h2>${esc(tr("transfer"))}</h2><p class="muted">${esc(tr("localOnly"))}</p><h3>Code de transfert</h3><div class="toolbar"><button id="generate-transfer" class="primary" type="button">${esc(tr("generateCode"))}</button><button id="copy-transfer" class="secondary" type="button">${esc(tr("copy"))}</button><button id="import-transfer" class="secondary" type="button">${esc(tr("import"))}</button></div><textarea id="transfer-code" class="code" spellcheck="false"></textarea><div id="transfer-qr" class="qr-box" hidden></div><p id="transfer-qr-help" class="muted small"></p><hr><h3>QR chiffré multi-parties</h3><p class="muted small">Pour les grosses configurations, DuoChat chiffre un export .duochat puis le découpe en plusieurs QR. Scanne tous les QR, colle chaque résultat sur une ligne et importe-les avec le même mot de passe.</p><div class="field"><label>${esc(tr("exportPassword"))}</label><input id="encrypted-qr-password" type="password" minlength="6"></div><div class="toolbar" style="margin-top:10px"><button id="generate-encrypted-qr" class="primary" type="button">Générer les QR chiffrés</button><button id="encrypted-qr-prev" class="secondary" type="button">←</button><span id="encrypted-qr-index" class="badge"></span><button id="encrypted-qr-next" class="secondary" type="button">→</button></div><div id="encrypted-transfer-qr" class="qr-box" hidden></div><textarea id="encrypted-qr-chunks" class="code" spellcheck="false" placeholder="DUOCHATQR1|1|…&#10;DUOCHATQR1|2|…"></textarea><button id="import-encrypted-qr" class="secondary" type="button">Assembler et importer les QR</button></article>
      ${data.snapshot.migrationNeedsEncryption && data.isAdmin ? `<article class="card"><h2>${esc(tr("encryptionMigration"))}</h2><p class="muted">${esc(tr("encryptionHelp"))}</p><form id="encryption-form" class="form-grid">${passwordFields}<div class="full"><button class="primary" type="submit">${esc(tr("encryptionMigration"))}</button></div></form><div id="recovery-box"></div></article>` : ""}
      <article class="card"><h2>${esc(tr("updateCenter"))}</h2><div class="grid two"><div><span class="muted small">${esc(tr("updateCurrent"))}</span><div><strong id="github-current-version">${esc(chrome.runtime.getManifest().version)}</strong></div></div><div><span class="muted small">${esc(tr("updateLatest"))}</span><div><strong id="github-latest-version">—</strong></div></div></div><div class="field" style="margin-top:12px"><label>${esc(tr("updateChannel"))}</label><select id="github-update-channel"><option value="stable">${esc(tr("updateStable"))}</option><option value="beta">${esc(tr("updateBeta"))}</option></select></div><div id="github-update-status" class="muted small">${esc(tr("updateChecking"))}</div><div class="muted small">Dernière vérification : <span id="github-update-checked">${esc(tr("updateNever"))}</span></div><pre id="github-update-notes" class="code" style="max-height:180px;overflow:auto;white-space:pre-wrap"></pre><div class="toolbar"><button id="github-update-check" class="secondary" type="button">${esc(tr("updateCheck"))}</button><button id="github-update-download" class="primary" type="button" disabled>${esc(tr("updateDownload"))}</button><button id="github-update-open" class="secondary" type="button">${esc(tr("updateOpenRelease"))}</button></div><p class="muted small">${esc(tr("updateManualHelp"))}</p><p class="muted small">${esc(tr("updatePublicRepo"))}</p></article>
      <article class="card"><h2>${esc(tr("shortcuts"))}</h2><p>${esc(tr("shortcutHelp"))}</p><p class="muted">${esc(tr("commandPalette"))}</p></article>
    </div>`;

    document.getElementById("language-select").addEventListener("change", async (e)=>{try{await send({type:"SET_LANGUAGE",language:e.target.value});language=e.target.value;render();}catch(err){flash(err.message,true);}});
    document.getElementById("global-form").addEventListener("submit", async (e)=>{e.preventDefault();const f=e.currentTarget;try{await send({type:"UPDATE_GLOBAL_SETTINGS",patch:{autoAssignNew:f.elements.autoAssignNew.checked,promptUnassigned:f.elements.promptUnassigned.checked,localBackups:f.elements.localBackups.checked,syncAllTabs:f.elements.syncAllTabs.checked}});flash(tr("done"));await reload(false);}catch(err){flash(err.message,true);}});
    document.getElementById("github-update-check")?.addEventListener("click",()=>refreshUpdateCard(true));
    document.getElementById("github-update-channel")?.addEventListener("change",async(e)=>{try{await send({type:"SET_UPDATE_CHANNEL",channel:e.target.value});await refreshUpdateCard(false);}catch(err){flash(err.message,true);}});
    document.getElementById("github-update-download")?.addEventListener("click",async()=>{try{const result=await send({type:"DOWNLOAD_GITHUB_UPDATE"});flash(`${tr("updateDownload")}: ${result.assetName || result.latestVersion}`);}catch(err){flash(err.message,true);}});
    document.getElementById("github-update-open")?.addEventListener("click",async()=>{try{await send({type:"OPEN_GITHUB_RELEASE"});}catch(err){flash(err.message,true);}});
    refreshUpdateCard(false);

    const cleanup = async (fix)=>{try{const res=await send({type:"CLEANUP",fix});document.getElementById("cleanup-output").textContent=JSON.stringify(res.findings,null,2);if(fix){flash(tr("done"));await reload(false);}}catch(e){flash(e.message,true);}};
    document.getElementById("cleanup-analyze").addEventListener("click",()=>cleanup(false));
    document.getElementById("cleanup-fix")?.addEventListener("click",()=>cleanup(true));
    let migrationSuggestions=[];
    document.getElementById("smart-migration-find")?.addEventListener("click",async()=>{try{const res=await send({type:"SMART_MIGRATION"});migrationSuggestions=res.suggestions||[];const out=document.getElementById("smart-migration-output");out.innerHTML=migrationSuggestions.length?migrationSuggestions.slice(0,50).map((item)=>`<label class="check"><input class="migration-item" type="checkbox" data-id="${esc(item.entityId)}" checked> <span><strong>${esc(item.title||item.entityId)}</strong><br><small class="muted">→ ${esc(profileName(item.suggestedProfileId))} · ${esc(item.score)} pts</small></span></label>`).join(""):`<div class="empty">${esc(tr("noSuggestions"))}</div>`;const apply=document.getElementById("smart-migration-apply");if(apply)apply.disabled=!migrationSuggestions.length;}catch(e){flash(e.message,true);}});
    document.getElementById("smart-migration-apply")?.addEventListener("click",async()=>{const checked=new Set([...document.querySelectorAll(".migration-item:checked")].map((x)=>x.dataset.id));const items=migrationSuggestions.filter((item)=>checked.has(item.entityId)&&item.score>=20);try{const res=await send({type:"SMART_MIGRATION_APPLY",items});flash(`${tr("done")} · ${res.applied}`);await reload(false);renderSettings();}catch(e){flash(e.message,true);}});
    document.getElementById("export-file").addEventListener("click", async ()=>{const pass=document.getElementById("export-password").value;try{const res=await send({type:"EXPORT_DUOCHAT_FILE",passphrase:pass});const blob=new Blob([res.content],{type:"application/octet-stream"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=res.filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);flash(tr("done"));}catch(e){flash(e.message,true);}});
    document.getElementById("import-file-button").addEventListener("click", async ()=>{const file=document.getElementById("import-file").files[0];if(!file)return;try{const content=await file.text();await send({type:"IMPORT_DUOCHAT_FILE",content,passphrase:document.getElementById("import-password").value});flash(tr("done"));setTimeout(()=>location.reload(),500);}catch(e){flash(e.message,true);}});
    document.getElementById("generate-transfer").addEventListener("click", async ()=>{try{const res=await send({type:"EXPORT_TRANSFER_CODE"});document.getElementById("transfer-code").value=res.code;renderQr(res.code);flash(tr("done"));}catch(e){flash(e.message,true);}});
    document.getElementById("copy-transfer").addEventListener("click", async ()=>{const text=document.getElementById("transfer-code").value;if(text){await navigator.clipboard.writeText(text);flash(tr("copied"));}});
    document.getElementById("import-transfer").addEventListener("click", async ()=>{const code=document.getElementById("transfer-code").value.trim();if(!code)return;try{await send({type:"IMPORT_TRANSFER_CODE",code});flash(tr("done"));setTimeout(()=>location.reload(),400);}catch(e){flash(e.message,true);}});
    document.getElementById("generate-encrypted-qr").addEventListener("click",async()=>{const pass=document.getElementById("encrypted-qr-password").value;try{const res=await send({type:"EXPORT_DUOCHAT_FILE",passphrase:pass});encryptedQrChunks=makeEncryptedQrChunks(res.content);encryptedQrIndex=0;document.getElementById("encrypted-qr-chunks").value=encryptedQrChunks.join("\n");renderEncryptedQrPage();flash(`${tr("done")} · ${encryptedQrChunks.length} QR`);}catch(e){flash(e.message,true);}});
    document.getElementById("encrypted-qr-prev").addEventListener("click",()=>{if(encryptedQrIndex>0){encryptedQrIndex--;renderEncryptedQrPage();}});
    document.getElementById("encrypted-qr-next").addEventListener("click",()=>{if(encryptedQrIndex<encryptedQrChunks.length-1){encryptedQrIndex++;renderEncryptedQrPage();}});
    document.getElementById("import-encrypted-qr").addEventListener("click",async()=>{try{const content=parseEncryptedQrChunks(document.getElementById("encrypted-qr-chunks").value);await send({type:"IMPORT_DUOCHAT_FILE",content,passphrase:document.getElementById("encrypted-qr-password").value});flash(tr("done"));setTimeout(()=>location.reload(),500);}catch(e){flash(e.message,true);}});
    document.getElementById("encryption-form")?.addEventListener("submit",async(e)=>{e.preventDefault();const passwords={};for(const p of data.profiles)passwords[p.id]=e.currentTarget.elements[`pw_${p.id}`].value;try{const res=await send({type:"ENABLE_ENCRYPTION",passwords});const box=document.getElementById("recovery-box");box.innerHTML=`<hr><h3>${esc(tr("recoveryKey"))}</h3><textarea class="code" readonly>${esc(res.recoveryKey)}</textarea><p class="muted">${esc(tr("recoveryWarning"))}</p>`;flash(tr("done"));await reload(false);}catch(err){flash(err.message,true);}});
  }

  function render() {
    renderNav();
    applyChrome();
    if (page === "overview") renderOverview();
    if (page === "chats") renderEntityPage("conversation");
    if (page === "projects") renderEntityPage("project");
    if (page === "rules") renderRules();
    if (page === "profiles") renderProfiles();
    if (page === "security") renderSecurity();
    if (page === "backups") renderBackups();
    if (page === "settings") renderSettings();
  }

  async function reload(showRender = true) {
    data = await send({ type:"GET_DASHBOARD" });
    if (showRender) render();
  }

  document.getElementById("lock-button").addEventListener("click", async ()=>{await send({type:"LOCK"});window.close();});
  document.getElementById("presentation-toggle").addEventListener("click", async ()=>{try{await send({type:"SET_MODE",mode:"presentation",enabled:!data.snapshot.presentationMode});await reload();}catch(e){flash(e.message,true);}});
  document.getElementById("screenshot-toggle").addEventListener("click", async ()=>{try{await send({type:"SET_MODE",mode:"screenshot",enabled:!data.snapshot.screenshotMode});await reload();}catch(e){flash(e.message,true);}});

  (async () => {
    try {
      const langResult = await send({ type:"GET_LANGUAGE" });
      language = I.normalizeLanguage(langResult.language) || "fr";
      await reload();
    } catch (error) {
      document.getElementById("page").innerHTML = `<article class="card"><h2>DuoChat</h2><p>Le dashboard nécessite un profil DuoChat déverrouillé.</p><a class="primary" style="display:inline-block;text-decoration:none" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Ouvrir ChatGPT</a></article>`;
      console.error(error);
    }
  })();
})();
