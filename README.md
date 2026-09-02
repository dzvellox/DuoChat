# DuoChat — deux espaces locaux sur ChatGPT

DuoChat est une extension Chrome Manifest V3 qui partage une même session `chatgpt.com` entre deux profils locaux, **Utilisateur A** et **Utilisateur B**. Chaque profil possède son propre mot de passe. L’extension masque les discussions et projets attribués à l’autre profil et bloque leur ouverture directe.

## Installation

1. Décompresse `DuoChat-extension.zip` dans un dossier que tu garderas sur l’ordinateur.
2. Ouvre `chrome://extensions` dans Chrome.
3. Active **Mode développeur** en haut à droite.
4. Clique sur **Charger l’extension non empaquetée**.
5. Sélectionne le dossier `duochat-extension` qui contient `manifest.json`.
6. Épingle DuoChat depuis l’icône des extensions, puis ouvre [ChatGPT](https://chatgpt.com/).

### Mise à jour depuis une ancienne version de DuoChat

Pour conserver tes profils et tes mots de passe, remplace les fichiers de l’ancien dossier DuoChat par ceux de la nouvelle version, puis ouvre `chrome://extensions` et clique sur l’icône **Actualiser** de DuoChat. La migration des données se fait automatiquement. Les projets déjà présents sont initialement non attribués : utilise une seule fois le mode **Récupérer les anciens éléments** pour les rattacher au bon profil.

## Première configuration

1. Crée un nom et un mot de passe distinct pour chaque profil.
2. Choisis le premier profil actif. Ce choix sera mémorisé.
3. Si l’historique actuel appartient à ce premier profil, garde la case d’import cochée. DuoChat lui attribuera les conversations et projets déjà visibles dans la barre latérale.
4. Les mots de passe doivent contenir au moins 6 caractères. Ils sont transformés localement en empreintes PBKDF2-SHA-256 avec un sel différent pour chaque profil ; ils ne sont pas enregistrés en clair.

## Utilisation

- Une nouvelle discussion créée sur la page d’accueil est automatiquement attribuée au profil actuellement ouvert.
- Un nouveau projet est automatiquement attribué au profil qui le crée. Les projets de l’autre profil sont entièrement masqués dans la barre latérale et leur ouverture directe est bloquée.
- Quand un profil ouvre l’un de ses projets, les conversations non classées affichées à l’intérieur sont automatiquement rattachées au même profil, sans écran supplémentaire.
- Clique sur l’icône DuoChat pour changer de profil. Le mot de passe du profil cible est obligatoire.
- Le dernier profil sélectionné est mémorisé. Il reste déverrouillé pendant la session du navigateur, puis son mot de passe est redemandé après la fermeture de Chrome.
- Le bouton **Verrouiller maintenant** masque immédiatement ChatGPT. Le raccourci `Alt` + `Maj` + `L` fait la même chose.
- Après cinq mots de passe incorrects, les essais sont bloqués pendant 30 secondes.

## Anciens projets et discussions non attribués

DuoChat ne peut pas deviner à qui appartenaient les projets et conversations créés avant son installation.

1. Ouvre le bon profil.
2. Dans le menu DuoChat, active **Récupérer les anciens éléments**.
3. Les projets et discussions encore sans propriétaire apparaissent avec un contour orange.
4. Clique sur un projet ou une discussion pour l’attribuer au profil actif.
5. Désactive ensuite le mode récupération.

## Ce que l’extension protège — et ses limites

DuoChat est une **séparation locale d’interface**, pas deux comptes OpenAI et pas un contrôle parental inviolable. Les deux personnes utilisent toujours le même compte ChatGPT et le même abonnement. Une personne ayant accès à Chrome peut désactiver ou supprimer l’extension, effacer ses données, utiliser un autre profil de navigateur ou consulter le compte depuis un autre appareil. Les développeurs de ChatGPT peuvent aussi modifier l’interface ; une mise à jour de l’extension peut alors devenir nécessaire.

Pour une séparation réellement sécurisée des données et de l’historique, il faut deux comptes OpenAI ou, au minimum, deux profils Chrome séparés avec chacun sa propre session.

## Vie privée

- Aucune donnée n’est envoyée par DuoChat vers un serveur externe.
- Les profils, empreintes de mots de passe et identifiants de conversations sont conservés dans `chrome.storage.local` sur l’ordinateur.
- L’état de déverrouillage temporaire est conservé dans `chrome.storage.session`.
- DuoChat ne lit ni ne stocke le contenu des messages.

## Développement et vérification

Avec Node.js 20 ou plus récent :

```bash
npm test
npm run check
```

La version actuelle cible uniquement `https://chatgpt.com/*` et ne charge aucune bibliothèque ni aucun script distant.
