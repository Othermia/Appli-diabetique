# GlucoSuivi — carnet de diabète de type 1

Application web installable sur téléphone (iPhone et Android) pour gérer le diabète de type 1 au quotidien.
Pas de compte, pas de serveur : toutes les données restent sur le téléphone.

## Fonctionnalités

- **📷 Glucides par photo** : on photographie l'assiette, l'IA (Claude) reconnaît les aliments, estime les portions et les glucides, l'index glycémique et donne des conseils. Tout reste modifiable avant d'enregistrer. Possibilité aussi de **décrire le repas** par écrit.
- **🔎 Table d'aliments** : environ 150 aliments courants (valeurs CIQUAL) avec portions types, aliments personnalisés (étiquette), **repas favoris**.
- **💉 Calcul de la dose** : ratio insuline/glucides par moment de la journée, correction selon la sensibilité, déduction de l'**insuline encore active**, réduction en cas d'activité physique, arrondi à la demi-unité. Le détail du calcul est toujours affiché.
- **🩸 Carnet** : glycémies, insuline rapide et lente, repas, activité, cétones, notes.
- **🍬 Aide hypoglycémie** : règle des 15 pas à pas, minuteur de 15 minutes, bouton d'appel du contact d'urgence et du 15.
- **📊 Statistiques** : temps dans la cible, moyenne, HbA1c estimée (GMI), variabilité, épisodes d'hypo, journée type heure par heure, glucides et insuline par jour.
- **📄 Rapport médecin** imprimable / PDF, export tableur (CSV), sauvegarde et restauration.
- **⏰ Rappels** : contrôle après repas, insuline lente, glycémie du coucher, avec export vers l'agenda du téléphone pour des alarmes fiables.
- Mode sombre, **taille de texte réglable**, fonctionne **hors connexion** (sauf l'analyse photo).

## Installation sur le téléphone

1. Ouvrir l'adresse de l'application (voir « Mise en ligne ») dans **Safari** (iPhone) ou **Chrome** (Android).
2. iPhone : bouton Partager → « Sur l'écran d'accueil ». Android : menu ⋮ → « Installer l'application ».
3. Au premier lancement, renseigner les réglages **avec les valeurs données par le diabétologue** (ratios, sensibilité, cibles).

## Analyse des photos

L'analyse utilise l'API Claude d'Anthropic. Il faut une clé personnelle :
créer un compte sur <https://console.anthropic.com>, ajouter du crédit, créer une clé (« API Keys ») et la coller dans Réglages → Analyse des photos.
La clé est stockée uniquement sur le téléphone ; seule la photo (réduite) est envoyée pour l'analyse. Trois modèles au choix : précis (Opus, par défaut), équilibré (Sonnet), économique (Haiku).

## Mise en ligne (GitHub Pages)

Le workflow `.github/workflows/pages.yml` lance les tests puis publie l'application à chaque push sur `main`.
À activer une fois : dépôt GitHub → Settings → Pages → Source : **GitHub Actions**.
L'application est ensuite disponible à l'adresse `https://<compte>.github.io/<dépôt>/`.

## Développement

Aucune dépendance ni étape de compilation (HTML, CSS et JavaScript modules).

```bash
npm test          # tests du moteur de calcul (doses, insuline active, statistiques)
npm start         # serveur local sur http://localhost:8080
```

| Fichier | Rôle |
|---|---|
| `js/calc.js` | Calculs purs : bolus, insuline active, statistiques, conversions |
| `js/ai.js` | Analyse des repas par Claude, préparation des photos |
| `js/meal.js` | Écran repas (photo, aliments, dose) |
| `js/foods.js` | Table d'aliments |
| `js/db.js` | Stockage local (IndexedDB) et réglages |
| `js/home.js`, `journal.js`, `stats.js`, `report.js`, `settings.js` | Écrans |
| `js/hypo.js`, `js/reminders.js` | Aide hypoglycémie, rappels |
| `sw.js` | Fonctionnement hors connexion |

## Avertissement

Cette application est une aide à la gestion du diabète et **ne remplace pas l'avis médical**.
Les estimations de glucides par photo sont approximatives et doivent être vérifiées.
Les doses suggérées dépendent entièrement des réglages saisis : ils doivent être validés par l'équipe soignante.
