# Discord Token Launcher

Launcher desktop moderne (Electron + TypeScript) pour gérer un nombre illimité de
comptes Discord via leurs tokens, avec sessions isolées et interface sombre façon Discord.

> 

## Fonctionnalités

- **Comptes illimités** — ajoute, nomme, réordonne et supprime autant de comptes que tu veux.
- **Connexion en un clic** — chaque compte ouvre une session Discord connectée dans un onglet.
- **Sessions isolées** — chaque compte a sa propre partition (cookies/localStorage cloisonnés).
- **Deux façons d'ajouter un compte :**
  - **Login intégré** : tu te connectes normalement dans une fenêtre Discord officielle,
    le token est capturé automatiquement.
  - **Coller un token** : champ manuel, validé puis chiffré.
- **Récupérer mon token actuel** : outil dédié qui révèle le token d'une session Discord.
- **Stockage chiffré** — les tokens sont chiffrés via `safeStorage` (DPAPI sous Windows),
  liés à ta session Windows. Le fichier `accounts.json` ne contient jamais de token en clair.
- **Options par compte** : renommer, rafraîchir avatar/pseudo, copier le token,
  se déconnecter (vider la session), supprimer.

## Prérequis

- Node.js 18+ (testé avec Node 24)
- Windows (le chiffrement utilise DPAPI ; l'app fonctionne aussi ailleurs avec un repli)

## Démarrage

```bash
npm install        # dépendances
npm run dev        # lance l'app en mode développement (hot reload)
```

## Build / distribution

```bash
npm run build      # compile main + preload + renderer dans out/
npm start          # lance la version compilée
npm run dist       # génère un installeur Windows (NSIS) dans release/
```

## Architecture

```
src/
  main/                Processus principal Electron
    index.ts           Cycle de vie, fenêtre (frameless), sécurité webview
    store.ts           Coffre chiffré (safeStorage/DPAPI) + accounts.json
    discord.ts         Validation de token via API Discord, avatars
    tokenCapture.ts    Fenêtre de login + interception de l'en-tête Authorization
    ipc.ts             Handlers IPC exposés au renderer
  preload/
    index.ts           Pont sécurisé (contextBridge) — API typée window.api
  renderer/
    index.html         Structure UI + barre de titre custom
    src/app.ts         Logique UI (liste, onglets, webviews, modales, menus)
    src/styles.css     Thème sombre façon Discord
  shared/
    types.ts           Types partagés (Account, DiscordUser, ...)
    util.ts            partitionFor() — nom de partition par compte
    inject.ts          Script d'injection du token dans Discord Web
```

### Comment fonctionne la connexion par token

Discord Web verrouille l'accès direct à `localStorage.token` une fois chargé. La technique
utilisée : créer une `<iframe>` même-origine (dont le `localStorage` est accessible), y écrire
le token, puis recharger la page. Au rechargement, Discord lit le token et ouvre la session.
L'injection n'a lieu que sur l'écran de connexion (`/login`) pour éviter toute boucle.

### Où sont stockées les données

`accounts.json` dans le dossier `userData` d'Electron
(`%APPDATA%/discord-token-launcher/` sous Windows). Chaque token y est chiffré (préfixe `enc:`).

## Sécurité & vie privée

- Aucune donnée n'est envoyée ailleurs que vers l'API officielle de Discord.
- Les tokens ne quittent jamais ta machine et restent chiffrés au repos.
- Le presse-papier n'est utilisé que lorsque tu demandes explicitement de copier un token.
