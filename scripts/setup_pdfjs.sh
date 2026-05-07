#!/bin/bash

# Script d'installation de PDF.js pour fonctionnement offline
# À exécuter sur le Raspberry Pi avec connexion internet avant déploiement

set -e

PDFJS_VERSION="3.11.174"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PDFJS_DIR="$PROJECT_ROOT/static/js/pdfjs"

echo "=== Installation de PDF.js v$PDFJS_VERSION ==="
echo ""

# Créer le dossier s'il n'existe pas
mkdir -p "$PDFJS_DIR"

# URLs des fichiers nécessaires
PDF_URL="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/$PDFJS_VERSION/pdf.min.js"
WORKER_URL="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/$PDFJS_VERSION/pdf.worker.min.js"

# Télécharger les fichiers
echo "Téléchargement de pdf.min.js..."
curl -L --progress-bar "$PDF_URL" -o "$PDFJS_DIR/pdf.min.js"

echo "Téléchargement de pdf.worker.min.js..."
curl -L --progress-bar "$WORKER_URL" -o "$PDFJS_DIR/pdf.worker.min.js"

echo ""
echo "=== Vérification des fichiers ==="
ls -lh "$PDFJS_DIR/"

echo ""
echo "=== Installation terminée ! ==="
echo "Les fichiers PDF.js sont maintenant disponibles dans: $PDFJS_DIR"
echo ""
echo "Vous pouvez maintenant déconnecter le Raspberry Pi d'internet."
echo "L'affichage des PDFs fonctionnera en mode offline."
