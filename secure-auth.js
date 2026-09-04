(function secureAuthPage(){
  "use strict";
  const C=globalThis.DuoChatCore, I=globalThis.DuoChatI18n;
  const app=document.getElementById("app");
  const nonce=new URLSearchParams(location.search).get("nonce") || "";
  let language="fr", request=null, snapshot=null, selectedProfileId=null;
  const accents=["#7667F5","#22A06B","#D97706","#E5484D","#2563EB","#9333EA","#0891B2","#DB2777"];
  const templates=["personal","work","study","development","guest","child"];
  const templateKeys={personal:"templatePersonal",work:"templateWork",study:"templateStudy",development:"templateDevelopment",guest:"templateGuest",child:"templateChild"};

  function t(key,vars){return I.t(language,key,vars||{});}
  function send(message){return new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,(response)=>{if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));if(!response||!response.ok)return reject(new Error(response&&response.error||"EXTENSION_UNAVAILABLE"));resolve(response.data);}));}
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function field(labelText,input){const wrap=el("div","field");const label=el("label",null,labelText);if(input.id)label.htmlFor=input.id;wrap.append(label,input);return wrap;}
  function input(type,name,autocomplete){const x=document.createElement("input");x.type=type;x.name=name;x.autocomplete=autocomplete||"off";return x;}
  function button(text,kind="secondary"){const b=el("button",`button ${kind}`,text);b.type="button";return b;}
  function errorBox(){const e=el("p","error","");e.setAttribute("role","alert");return e;}
  function note(){return el("p","note",t("secureAuthHint"));}
  function friendly(code){if(code==="WRONG_PASSWORD")return t("errorWrongPassword");if(code==="PASSWORD_TOO_SHORT")return t("errorPasswordShort",{count:C.MIN_PASSWORD_LENGTH});if(code==="PROFILE_NAME_ALREADY_EXISTS")return t("errorDuplicateProfile");if(code&&code.startsWith("TEMPORARILY_BLOCKED:"))return t("errorBlocked",{seconds:code.split(":")[1]});if(code==="WEBAUTHN_UNAVAILABLE")return t("webauthnUnavailable");if(code&&code.startsWith("WEBAUTHN_"))return t("webauthnFailed");return `${t("errorGeneric")} (${code||"UNKNOWN"})`;}
  function bytesToBase64Url(bytes){return C.bytesToBase64Url(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));}
  async function webauthnAssertion(profileId){
    if(!navigator.credentials||typeof navigator.credentials.get!=="function")throw new Error("WEBAUTHN_UNAVAILABLE");
    const begin=await send({type:"BEGIN_WEBAUTHN_AUTHENTICATION",profileId});
    const credential=await navigator.credentials.get({publicKey:{challenge:C.base64UrlToBytes(begin.challenge),allowCredentials:[{type:"public-key",id:C.base64UrlToBytes(begin.credentialId)}],userVerification:"required",timeout:60000}});
    if(!credential||!credential.response)throw new Error("WEBAUTHN_CANCELLED");
    return {credentialId:bytesToBase64Url(new Uint8Array(credential.rawId)),clientDataJSON:bytesToBase64Url(new Uint8Array(credential.response.clientDataJSON)),authenticatorData:bytesToBase64Url(new Uint8Array(credential.response.authenticatorData)),signature:bytesToBase64Url(new Uint8Array(credential.response.signature)),userHandle:credential.response.userHandle?bytesToBase64Url(new Uint8Array(credential.response.userHandle)):null};
  }
  async function unlockProfile(profileId,password){const profile=snapshot.profiles[profileId];let webauthnAssertionValue=null;if(profile&&profile.webauthnEnabled)webauthnAssertionValue=await webauthnAssertion(profileId);snapshot=await send({type:"UNLOCK",profileId,password,webauthnAssertion:webauthnAssertionValue});return snapshot;}
  async function close(){try{await send({type:"CLEAR_SECURE_REQUEST",nonce});}catch(_e){}await send({type:"CLOSE_SECURE_AUTH",nonce}).catch(()=>window.close());}
  function header(title,lead){app.replaceChildren();app.append(el("h1",null,title),el("p",null,lead),note());}
  function profilePicker(preselect){
    const root=el("div","profiles");selectedProfileId=preselect&&snapshot.profiles[preselect]?preselect:(snapshot.activeProfileId&&snapshot.profiles[snapshot.activeProfileId]?snapshot.activeProfileId:snapshot.profileOrder[0]);
    for(const id of snapshot.profileOrder){const profile=snapshot.profiles[id];if(!profile)continue;const b=el("button","profile");b.type="button";b.dataset.profile=id;b.setAttribute("aria-pressed",String(id===selectedProfileId));b.append(el("strong",null,profile.name),el("span",null,profile.webauthnEnabled?"WebAuthn + password":t("passwordRequired")));b.addEventListener("click",()=>{selectedProfileId=id;for(const x of root.children)x.setAttribute("aria-pressed",String(x===b));});root.append(b);}return root;
  }
  function renderLogin(){
    header(t("gateLoginTitle",{site:"ChatGPT / Claude"}),t("gateLoginLead"));
    if(!snapshot.profileOrder.length){app.append(el("p","error",t("errorGeneric")));return;}
    app.append(profilePicker(request.preselectedProfileId));
    const pwd=input("password","password","current-password");pwd.id="secure-password";pwd.required=true;app.append(field(t("password"),pwd));const err=errorBox();app.append(err);const actions=el("div","actions");const go=button(t("openSpace"),"primary"),cancel=button(t("cancel"));actions.append(go,cancel);app.append(actions);
    go.addEventListener("click",async()=>{err.textContent="";go.disabled=true;try{await unlockProfile(selectedProfileId,pwd.value);await close();}catch(e){err.textContent=friendly(e.message);go.disabled=false;pwd.select();}});cancel.addEventListener("click",close);pwd.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();go.click();}});pwd.focus();
  }
  function renderSensitive(){
    header(t("extraAccessTitle"),t("extraAccessLead"));const pwd=input("password","password","current-password");pwd.id="secure-sensitive-password";pwd.required=true;app.append(field(t("extraPasswordLabel"),pwd));const err=errorBox();app.append(err);const actions=el("div","actions");const go=button(t("extraUnlock10"),"primary"),cancel=button(t("cancel"));actions.append(go,cancel);app.append(actions);go.addEventListener("click",async()=>{go.disabled=true;err.textContent="";try{await send({type:"AUTHORIZE_ENTITY",entityId:request.entityId,password:pwd.value});await close();}catch(e){err.textContent=friendly(e.message);go.disabled=false;pwd.select();}});cancel.addEventListener("click",close);pwd.focus();
  }
  function renderAssign(){
    header(request.entityType==="project"?t("unassignedProjectTitle"):t("unassignedConversationTitle"),request.entityType==="project"?t("unassignedProjectLead"):t("unassignedConversationLead"));app.append(profilePicker(snapshot.activeProfileId));const pwd=input("password","password","current-password");pwd.id="secure-assign-password";app.append(field(t("password"),pwd));const err=errorBox();app.append(err);const actions=el("div","actions");const go=button(t("secureAssignOpen"),"primary"),cancel=button(t("cancel"));actions.append(go,cancel);app.append(actions);
    go.addEventListener("click",async()=>{go.disabled=true;err.textContent="";try{if(!snapshot.unlocked||selectedProfileId!==snapshot.activeProfileId)await unlockProfile(selectedProfileId,pwd.value);if(request.entityType==="project")await send({type:"CLAIM_PROJECT_WITH_CONVERSATIONS",projectId:request.entityId,conversationIds:request.conversationIds||[]});else await send({type:"CLAIM_CONVERSATION",conversationId:request.entityId});await close();}catch(e){err.textContent=friendly(e.message);go.disabled=false;pwd.select();}});cancel.addEventListener("click",close);
  }
  function setupProfileCard(index){
    const card=el("section","profile-editor");const title=el("h2",null,index===0?t("administrator"):`${t("profileName")} ${index+1}`);const name=input("text",`name-${index}`,"nickname");name.value=index===0?t("defaultUserA"):index===1?t("defaultUserB"):`${t("users")} ${index+1}`;name.maxLength=30;const template=document.createElement("select");template.name=`template-${index}`;for(const value of templates){const o=document.createElement("option");o.value=value;o.textContent=t(templateKeys[value]);template.append(o);}const pwd=input("password",`password-${index}`,"new-password");pwd.minLength=C.MIN_PASSWORD_LENGTH;const confirm=input("password",`confirm-${index}`,"new-password");confirm.minLength=C.MIN_PASSWORD_LENGTH;const grid=el("div","grid");grid.append(field(t("profileName"),name),field(t("profileTemplate"),template),field(t("profilePassword"),pwd),field(t("confirmPasswordGeneric"),confirm));card.append(title,grid);return card;
  }
  function renderSetup(){
    header(t("gateSetupTitle"),t("setupWizardLead"));
    const lang=document.createElement("select");for(const item of I.SUPPORTED_LANGUAGES){const o=document.createElement("option");o.value=item.id;o.textContent=item.nativeLabel;o.selected=item.id===language;lang.append(o);}app.append(field(t("languageChoose"),lang));
    const count=document.createElement("select");for(let n=2;n<=8;n++){const o=document.createElement("option");o.value=String(n);o.textContent=String(n);count.append(o);}app.append(field(t("profileCount"),count));const profilesRoot=el("div");app.append(profilesRoot);
    const first=document.createElement("select");const firstField=field(t("firstProfile"),first);app.append(firstField);
    const options=el("div");function check(name,label,checked=true){const l=el("label","check");const c=input("checkbox",name);c.checked=checked;l.append(c,el("span",null,label));return l;}const importVisible=check("importVisible",t("importVisibleHelp"),true),autoAssign=check("autoAssign",t("autoAssignNew"),true),prompt=check("prompt",t("promptUnassigned"),true);options.append(importVisible,autoAssign,prompt);app.append(options);const err=errorBox();app.append(err);const actions=el("div","actions");const create=button(t("createProtectedProfiles"),"primary"),cancel=button(t("cancel"));actions.append(create,cancel);app.append(actions);
    const renderCards=()=>{profilesRoot.replaceChildren();first.replaceChildren();for(let i=0;i<Number(count.value);i++){const card=setupProfileCard(i);profilesRoot.append(card);const o=document.createElement("option");o.value=String(i);o.textContent=card.querySelector(`[name="name-${i}"]`).value;card.querySelector(`[name="name-${i}"]`).addEventListener("input",e=>o.textContent=e.currentTarget.value||`${t("users")} ${i+1}`);first.append(o);}};count.addEventListener("change",renderCards);renderCards();
    create.addEventListener("click",async()=>{create.disabled=true;err.textContent="";try{const profiles=[];const seen=new Set();for(let i=0;i<Number(count.value);i++){const name=profilesRoot.querySelector(`[name="name-${i}"]`).value.trim()||`${t("users")} ${i+1}`;const password=profilesRoot.querySelector(`[name="password-${i}"]`).value;const confirm=profilesRoot.querySelector(`[name="confirm-${i}"]`).value;const template=profilesRoot.querySelector(`[name="template-${i}"]`).value;if(password!==confirm)throw new Error("PASSWORD_CONFIRM_MISMATCH");if(!C.isValidPassword(password))throw new Error("PASSWORD_TOO_SHORT");const key=name.toLocaleLowerCase();if(seen.has(key))throw new Error("PROFILE_NAME_ALREADY_EXISTS");seen.add(key);profiles.push({name,password,template,avatar:template==="work"?"💼":template==="study"?"🎓":template==="development"?"💻":template==="guest"?"🕒":template==="child"?"🧩":"👤",accent:accents[i%accents.length],temporary:template==="guest"?{mode:"session"}:null});}
      language=I.normalizeLanguage(lang.value)||"fr";await send({type:"SET_LANGUAGE",language});const useVisible=importVisible.querySelector("input").checked;const result=await send({type:"CONFIGURE_ADVANCED",profiles,firstProfileIndex:Number(first.value)||0,conversationIds:useVisible?(request.conversationIds||[]):[],projectIds:useVisible?(request.projectIds||[]):[],ruleDefaults:{autoAssignNew:autoAssign.querySelector("input").checked,promptUnassigned:prompt.querySelector("input").checked}});snapshot=result.snapshot;renderRecovery(result.recoveryKey);}catch(e){err.textContent=e.message==="PASSWORD_CONFIRM_MISMATCH"?t("confirmMismatch"):friendly(e.message);create.disabled=false;}});cancel.addEventListener("click",close);
  }
  function renderRecovery(key){header(t("recoveryKeyTitle"),t("recoveryKeyLead"));const code=el("code","recovery",key);const warning=el("p","note",t("recoveryKeyWarning"));const actions=el("div","actions");const copy=button(t("copy")),done=button(t("recoveryKeySaved"),"primary");copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(key);copy.textContent=t("copied");}catch(_e){}});done.addEventListener("click",close);actions.append(copy,done);app.append(code,warning,actions);}
  async function init(){
    document.getElementById("security-hint").textContent="DuoChat credential entry is isolated from the ChatGPT / Claude page DOM.";
    if(!nonce){app.textContent="Invalid secure request.";return;}
    try{request=await send({type:"GET_SECURE_REQUEST",nonce});const langResult=await send({type:"GET_LANGUAGE"});language=I.normalizeLanguage(langResult.language)||I.normalizeLanguage(navigator.language)||"fr";snapshot=await send({type:"GET_SNAPSHOT"});document.documentElement.lang=language;if(request.mode==="setup")renderSetup();else if(request.mode==="sensitive")renderSensitive();else if(request.mode==="assign")renderAssign();else renderLogin();}catch(e){app.replaceChildren(el("h1",null,"DuoChat"),el("p","error",friendly(e.message)));}
  }
  init();
})();
