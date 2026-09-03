<div align="center">
  <img src="./icons/icon-128.png" width="104" height="104" alt="Logo DuoChat">

  <h1>DuoChat</h1>

  <p><strong>Autant d’espaces locaux protégés par mot de passe que nécessaire sur ChatGPT et Claude.</strong></p>

  <p>
    DuoChat sépare les conversations et les projets de plusieurs utilisateurs partageant ChatGPT ou Claude dans Chrome.
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-1.3.1-6558E8" alt="Version 1.3.1">
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/tests-15%20passed-13866F" alt="15 tests réussis">
    <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial-5C5C68" alt="Licence AGPL-3.0 et commerciale">
  </p>
</div>

> [!IMPORTANT]
> DuoChat crée une séparation **locale de l’interface**. Il ne transforme pas un compte ChatGPT ou Claude en deux véritables comptes et ne constitue pas un contrôle parental inviolable.

## Sommaire

- [Pourquoi DuoChat ?](#pourquoi-duochat-)
- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Première configuration](#première-configuration)
- [Utilisation](#utilisation)
- [Utilisation sur plusieurs ordinateurs](#utilisation-sur-plusieurs-ordinateurs)
- [Anciennes conversations et anciens projets](#anciennes-conversations-et-anciens-projets)
- [Fonctionnement technique](#fonctionnement-technique)
- [Sécurité et confidentialité](#sécurité-et-confidentialité)
- [Permissions Chrome](#permissions-chrome)
- [Limites importantes](#limites-importantes)
- [Développement](#développement)
- [Contribution](#contribution)
- [Dépannage](#dépannage)
- [Feuille de route](#feuille-de-route)
- [Licence](#licence)
- [Avertissement](#avertissement)

## Pourquoi DuoChat ?

ChatGPT et Claude ne proposent pas de sous-profils locaux permettant à plusieurs personnes partageant un compte ou un navigateur de conserver des historiques visuellement séparés.

DuoChat ajoute cette organisation directement dans le navigateur :

- chaque utilisateur ne voit que les conversations et projets qui lui sont attribués ;
- chaque espace possède son propre mot de passe ;
- le changement de profil nécessite le mot de passe du profil cible ;
- aucune infrastructure externe n’est nécessaire.

## Fonctionnalités

### Profils locaux illimités

- Deux profils sont créés lors de l’installation initiale, puis autant de profils supplémentaires que nécessaire peuvent être ajoutés.
- Les mêmes profils fonctionnent sur `chatgpt.com` et `claude.ai`.
- Noms personnalisables lors de la première configuration.
- Mot de passe distinct pour chaque profil.
- Mémorisation du dernier profil sélectionné.
- Verrouillage automatique après la fermeture du navigateur.

### Séparation des conversations

- Attribution automatique des nouvelles conversations au profil actif.
- Masquage des conversations appartenant à l’autre profil.
- Blocage de l’ouverture directe d’une conversation protégée.
- Protection du titre de l’onglet lorsqu’un contenu est verrouillé.

### Séparation des projets

- Attribution automatique des nouveaux projets au profil actif.
- Masquage des projets appartenant à l’autre profil.
- Blocage de l’ouverture directe d’un projet protégé.
- Attribution silencieuse au bon profil des nouvelles conversations créées dans un projet autorisé.
- Reconnaissance des différents formats d’identifiants de projet utilisés par ChatGPT.
- Prise en charge des routes de projet et de chat imbriquées utilisées par Claude.
- Espaces de noms distincts pour empêcher toute collision entre un identifiant ChatGPT et un identifiant Claude.

### Verrouillage et récupération

- Verrouillage immédiat depuis le menu de l’extension.
- Raccourci clavier `Alt` + `Maj` + `L`.
- Mode de récupération pour attribuer les éléments créés avant l’installation.
- Pause de 30 secondes après cinq mots de passe incorrects.

### Transfert entre ordinateurs sans base de données

- Génération d’un code de transfert depuis le menu DuoChat.
- Import du code sur un nouveau PC sans Supabase, Firebase ou serveur DuoChat.
- Copie des profils, empreintes de mots de passe et attributions ChatGPT/Claude.
- Fusion possible avec une installation DuoChat déjà configurée.
- Conservation des attributions locales lorsqu’un conflit est détecté.

### Respect de la vie privée

- Aucun serveur DuoChat.
- Aucun compte DuoChat.
- Aucun outil d’analyse ou de suivi.
- Aucun contenu de message enregistré ou transmis par l’extension.
- Aucun script distant chargé par l’extension.

## Installation

DuoChat n’étant pas encore distribué sur le Chrome Web Store, l’installation s’effectue en mode développeur.

1. Télécharge le dépôt avec **Code → Download ZIP**, ou clone-le avec Git.
2. Décompresse l’archive si nécessaire.
3. Ouvre `chrome://extensions` dans Chrome.
4. Active **Mode développeur** en haut à droite.
5. Clique sur **Charger l’extension non empaquetée**.
6. Sélectionne le dossier contenant `manifest.json`.
7. Épingle DuoChat depuis le menu des extensions.
8. Ouvre [chatgpt.com](https://chatgpt.com/) ou [claude.ai](https://claude.ai/).

> [!TIP]
> Conserve le dossier de l’extension après l’installation. Chrome en a besoin pour la recharger et appliquer les prochaines mises à jour.

## Première configuration

Au premier lancement sur ChatGPT ou Claude :

1. Choisis le nom du profil A.
2. Crée son mot de passe.
3. Choisis le nom du profil B.
4. Crée son mot de passe.
5. Sélectionne le premier profil à ouvrir.
6. Indique si les éléments actuellement visibles doivent être attribués à ce premier profil.

Tu peux ensuite ouvrir le menu DuoChat et choisir **Ajouter un utilisateur** autant de fois que nécessaire.

Chaque mot de passe doit contenir au moins six caractères. Pour une meilleure protection, utilise une phrase de passe longue et différente pour chaque utilisateur.

> [!WARNING]
> Il n’existe aucun mécanisme de récupération du mot de passe. Supprimer les données de l’extension réinitialise aussi les profils et toutes les attributions locales.

## Utilisation

### Créer une conversation

Ouvre le bon profil, puis crée normalement une conversation depuis ChatGPT ou Claude. DuoChat l’attribue automatiquement au profil actif.

### Utiliser un projet

Ouvre ou crée le projet depuis le bon profil, sur ChatGPT comme sur Claude. Le projet et les nouvelles conversations lancées à l’intérieur sont rattachés au même utilisateur sans étape supplémentaire.

### Changer d’utilisateur

1. Clique sur l’icône DuoChat dans la barre d’outils de Chrome.
2. Sélectionne l’autre profil.
3. Saisis le mot de passe de ce profil.

Les onglets ChatGPT et Claude ouverts sont immédiatement filtrés avec les conversations et projets du nouvel utilisateur.

### Verrouiller l’espace

Utilise le bouton **Verrouiller maintenant** dans le menu DuoChat ou le raccourci `Alt` + `Maj` + `L`.

Les raccourcis d’extensions peuvent être modifiés depuis `chrome://extensions/shortcuts`.

## Utilisation sur plusieurs ordinateurs

DuoChat peut transférer son espace sans aucune base de données :

1. Sur le premier PC, ouvre le profil actif et clique sur l’icône DuoChat.
2. Déplie **Relier un autre ordinateur**.
3. Clique sur **Générer**, puis sur **Copier**.
4. Envoie le code à l’autre utilisateur par un canal privé.
5. Sur le second PC, installe DuoChat et colle le code dans **Code de transfert DuoChat**.
6. Clique sur **Importer les profils**.
7. Chaque profil est alors accessible avec son propre mot de passe.

Le code copie un instantané de l’état au moment de sa génération. Comme aucun serveur ni aucune base de données n’est utilisé, les changements futurs ne peuvent pas apparaître automatiquement sur un PC éteint ou distant. Pour resynchroniser de nouvelles attributions, génère un nouveau code sur le PC le plus à jour et importe-le sur l’autre. L’import fusionne les nouveaux profils et éléments ; en cas de conflit, l’attribution déjà présente sur le PC destinataire est conservée.

> [!CAUTION]
> Le code de transfert n’est pas un mot de passe et son contenu est seulement encodé pour le transport. Il ne contient aucun message ou cookie ChatGPT/Claude, mais il contient les noms des profils, les empreintes de leurs mots de passe et les identifiants attribués. Ne le publie jamais dans une issue GitHub.

## Anciennes conversations et anciens projets

DuoChat ne peut pas déterminer automatiquement le propriétaire des éléments créés avant son installation.

Pour les classer :

1. Ouvre le profil auquel les éléments appartiennent.
2. Clique sur l’icône DuoChat.
3. Active **Récupérer les anciens éléments**.
4. Les éléments sans propriétaire apparaissent avec un contour orange.
5. Clique sur un projet ou une conversation pour l’attribuer au profil actif.
6. Désactive ensuite le mode de récupération.

Un élément déjà attribué à l’autre profil ne peut pas être récupéré depuis le mauvais espace.

## Fonctionnement technique

DuoChat est une extension Chrome **Manifest V3** sans dépendance d’exécution ni service distant.

| Fichier | Responsabilité |
| --- | --- |
| `manifest.json` | Permissions, scripts, popup, icônes et raccourci clavier |
| `background.js` | Authentification, attribution des éléments, stockage et synchronisation entre les onglets ChatGPT et Claude |
| `content.js` | Protection de la page, détection des routes ChatGPT/Claude et filtrage de l’interface |
| `content.css` | Écrans de configuration, verrouillage et protection |
| `popup.html` / `popup.css` / `popup.js` | Menu DuoChat et changement de profil |
| `core.js` | Validation, profils dynamiques, codes de transfert, espaces de noms et cryptographie partagée |
| `tests/` | Tests du cœur, du manifeste et des règles de sécurité statiques |

### Cycle d’une conversation

1. L’utilisateur ouvre un profil avec son mot de passe.
2. Une nouvelle conversation reçoit l’identifiant du profil actif.
3. L’association est conservée localement.
4. Les liens appartenant à l’autre profil sont masqués.
5. Une tentative d’ouverture directe affiche l’écran de protection.

### Stockage local

| Donnée | Emplacement | Durée |
| --- | --- | --- |
| Noms des profils | `chrome.storage.local` | Jusqu’à la suppression des données de l’extension |
| Empreintes des mots de passe | `chrome.storage.local` | Jusqu’à la suppression des données de l’extension |
| Propriétaires des conversations et projets | `chrome.storage.local` | Jusqu’à la suppression des données de l’extension |
| Profil temporairement déverrouillé | `chrome.storage.session` | Session du navigateur |
| Mode de récupération | `chrome.storage.session` | Session du navigateur |

## Sécurité et confidentialité

### Protection des mots de passe

Les mots de passe ne sont jamais stockés en clair. DuoChat utilise :

- PBKDF2 avec SHA-256 ;
- 310 000 itérations ;
- un sel aléatoire de 16 octets différent pour chaque profil ;
- une comparaison de taille constante des empreintes ;
- une limitation temporaire après plusieurs échecs.

### Données manipulées

DuoChat conserve uniquement les informations nécessaires à la séparation locale :

- noms des profils ;
- empreintes cryptographiques des mots de passe ;
- identifiants techniques des conversations et projets ;
- ordre des profils et données nécessaires aux transferts manuels ;
- profil actif et état de session.

L’extension ne stocke pas le texte des messages, les fichiers envoyés à ChatGPT ou Claude, ni les réponses générées.

## Permissions Chrome

| Permission | Utilisation |
| --- | --- |
| `storage` | Enregistrer localement les profils, empreintes et attributions |
| `tabs` | Actualiser la protection dans les onglets ChatGPT et Claude ouverts après un changement de profil |
| `https://chatgpt.com/*` | Exécuter le filtrage uniquement sur le site ChatGPT |
| `https://claude.ai/*` | Exécuter le filtrage uniquement sur le site Claude |

DuoChat ne demande aucun accès à l’historique global de Chrome, aux téléchargements, au presse-papiers, à la caméra ou au microphone.

## Limites importantes

DuoChat fournit une séparation pratique pour des personnes de confiance partageant un navigateur. Ce n’est pas une frontière de sécurité forte.

- Sur chaque service, les deux profils utilisent toujours le même compte et le même abonnement ChatGPT ou Claude.
- Les limites d’utilisation, paramètres du compte, facturation et fonctionnalités restent partagés.
- La mémoire et la personnalisation gérées par ChatGPT ou Claude ne sont pas séparées par DuoChat.
- Une personne ayant accès à Chrome peut désactiver l’extension, effacer son stockage ou ouvrir le compte depuis un autre navigateur ou appareil.
- Le code de transfert est un instantané manuel, pas une synchronisation automatique en temps réel.
- Les outils de développement du navigateur permettent à un utilisateur avancé de contourner une protection locale.
- Une modification de l’interface ou des routes de ChatGPT ou Claude peut nécessiter une mise à jour de DuoChat.

Pour une isolation réelle, utilise des comptes distincts ou deux profils Chrome séparés possédant chacun leurs propres sessions ChatGPT et Claude.

## Développement

### Prérequis

- Chrome ou un navigateur Chromium compatible avec Manifest V3 ;
- Node.js 20 ou plus récent pour exécuter les tests ;
- aucune installation de dépendance nécessaire.

### Lancer les vérifications

```bash
npm test
npm run check
```

La suite actuelle vérifie notamment :

- l’extraction des identifiants de conversations ;
- la normalisation des différents formats d’identifiants de projets ;
- l’isolation des identifiants entre ChatGPT et Claude ;
- la migration automatique des anciennes attributions ChatGPT ;
- la gestion d’un nombre dynamique de profils ;
- l’export, l’import et la fusion des codes de transfert ;
- la reconnaissance d’un projet lors de l’ouverture d’un chat ;
- le hachage et la vérification des mots de passe ;
- la migration et la validation des propriétaires ;
- la validité du manifeste ;
- la présence des fichiers déclarés ;
- l’absence d’`eval` et de chargements distants dans les scripts.

### Recharger l’extension pendant le développement

1. Modifie les fichiers.
2. Ouvre `chrome://extensions`.
3. Clique sur **Actualiser** sur la carte DuoChat.
4. Recharge les onglets ChatGPT et Claude ouverts.

## Contribution

Les corrections, améliorations et retours de compatibilité sont les bienvenus.

1. Forke le dépôt.
2. Crée une branche dédiée :

   ```bash
   git checkout -b fix/description-courte
   ```

3. Effectue une modification ciblée.
4. Exécute `npm run check`.
5. Décris clairement le problème résolu et le comportement attendu.
6. Ouvre une pull request.

Pour signaler un bug, indique si possible :

- la version de DuoChat ;
- la version de Chrome ;
- les étapes exactes pour reproduire le problème ;
- le résultat obtenu et le résultat attendu ;
- une capture d’écran sans donnée personnelle ;
- les erreurs visibles dans la console de l’extension.

Ne publie jamais de mot de passe, de contenu privé, de cookie de session ou d’identifiant d’authentification dans une issue.

> [!NOTE]
> Afin de préserver la possibilité d’une double licence, une contribution importante pourra nécessiter un accord de contribution distinct avant son intégration.

## Dépannage

### « Projet non attribué » apparaît à chaque nouveau chat

Installe DuoChat `1.1.1` ou une version plus récente. Cette version normalise les deux formats d’identifiant que ChatGPT peut utiliser pour un même projet. La version `1.2.0` ajoute Claude, la version `1.3.0` ajoute les profils illimités et les transferts entre PC, et la version `1.3.1` améliore le popup ainsi que ses états de survol en thème sombre.

### Une ancienne conversation ou un ancien projet a disparu

L’élément est probablement encore sans propriétaire. Active **Récupérer les anciens éléments** depuis le bon profil, puis sélectionne-le.

### L’autre profil ne voit aucune conversation

Les éléments existants ont peut-être été attribués au premier profil pendant la configuration. Utilise le mode de récupération uniquement pour les éléments encore non attribués. Un futur outil de gestion permettra de transférer explicitement un élément déjà attribué.

### ChatGPT ou Claude reste verrouillé après un changement de profil

Recharge l’onglet avec `Ctrl` + `R`. Vérifie ensuite sur `chrome://extensions` que DuoChat est activé et à jour.

### Le raccourci clavier ne fonctionne pas

Ouvre `chrome://extensions/shortcuts`, puis vérifie que le raccourci de DuoChat n’entre pas en conflit avec une autre extension.

### Le filtrage ne fonctionne plus après une mise à jour de ChatGPT ou Claude

Les sélecteurs et routes d’une application web peuvent évoluer. Ouvre une issue avec les étapes de reproduction, la version de Chrome et une capture d’écran anonymisée.

## Feuille de route

- Gestion permettant de transférer une conversation ou un projet entre profils.
- Modification des noms et mots de passe après la configuration.
- Délai de verrouillage automatique configurable.
- Synchronisation pair-à-pair en temps réel lorsqu’au moins deux appareils sont connectés.
- Tests automatisés de bout en bout sur les interfaces ChatGPT et Claude.
- Compatibilité vérifiée avec d’autres navigateurs Chromium.
- Préparation d’une publication sur le Chrome Web Store.

Les propositions sont les bienvenues dans les issues du dépôt.

## Licence

DuoChat adopte un modèle de **double licence** :

1. **GNU AGPL v3** pour l’utilisation, l’étude, la modification et la redistribution du projet dans le respect des obligations de cette licence.
2. **Licence commerciale séparée** pour les personnes ou organisations souhaitant intégrer, modifier ou redistribuer DuoChat sans appliquer les obligations de l’AGPL à leur solution propriétaire.

Les conditions commerciales, y compris une éventuelle redevance ou un partage de revenus, sont définies dans un accord séparé avec le propriétaire du dépôt.

> [!NOTE]
> Une licence open source autorise également l’usage commercial lorsqu’il respecte ses conditions. Exiger systématiquement un pourcentage sur toute revente nécessite une licence commerciale personnalisée et ne relève pas, à elle seule, d’une licence open source approuvée par l’OSI.

Consulte le [texte complet de la GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html) pour les conditions open source. Pour demander une licence commerciale, contacte le propriétaire du dépôt via son profil GitHub.

## Avertissement

DuoChat est un projet indépendant et non officiel. Il n’est affilié ni à OpenAI ni à Anthropic, et n’est approuvé ou sponsorisé par aucune de ces sociétés.

« OpenAI », « ChatGPT », « Anthropic », « Claude » et les marques associées appartiennent à leurs propriétaires respectifs. L’utilisation de DuoChat reste soumise aux conditions applicables de chaque service.

---

<div align="center">
  <strong>DuoChat</strong><br>
  Une séparation locale simple pour partager plus proprement ChatGPT et Claude.
</div>
