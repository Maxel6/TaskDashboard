# Déploiement sur Raspberry Pi (Mode Offline)

## Problème
Par défaut, l'application charge PDF.js depuis un CDN (internet). Sur un Raspberry Pi sans connexion, les PDFs ne s'affichent pas.

## Solution
PDF.js est maintenant inclus localement dans le projet. Plus besoin d'internet pour afficher les PDFs !

## Structure des fichiers
```
static/js/pdfjs/
├── pdf.min.js           # Bibliothèque PDF.js principale
└── pdf.worker.min.js    # Web Worker pour PDF.js
```

## Déploiement

### Option 1: Les fichiers sont déjà dans le repo (recommandé)
Si vous clonez/pull ce repo sur le Raspberry Pi, les fichiers PDF.js sont déjà présents dans `static/js/pdfjs/`.

Aucune action supplémentaire requise !

### Option 2: Script d'installation (si besoin de mettre à jour)
Sur le Raspberry Pi (avec connexion temporaire) :

```bash
cd /chemin/vers/TaskDashboard
bash scripts/setup_pdfjs.sh
```

Ce script télécharge automatiquement les fichiers PDF.js nécessaires.

## Vérification
Pour vérifier que tout est en place :

```bash
ls -la static/js/pdfjs/
```

Vous devriez voir :
- `pdf.min.js` (~320KB)
- `pdf.worker.min.js` (~1MB)

## Désactivation d'internet
Une fois les fichiers en place, vous pouvez déconnecter le Raspberry Pi d'internet. L'affichage des PDFs fonctionnera entièrement en mode offline.

## Notes
- Les modifications ont été faites dans :
  - `templates/display3.html` : utilise `static/js/pdfjs/pdf.min.js`
  - `static/js/display3.js` : utilise `/static/js/pdfjs/pdf.worker.min.js`
- Aucune autre dépendance externe n'est requise pour l'affichage des PDFs
