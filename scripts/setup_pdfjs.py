#!/usr/bin/env python3
"""
Script d'installation de PDF.js pour fonctionnement offline
À exécuter sur le Raspberry Pi avec connexion internet avant déploiement
"""

import os
import sys
import urllib.request
from pathlib import Path

PDFJS_VERSION = "3.11.174"

# Chemins
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent
pdfjs_dir = project_root / "static" / "js" / "pdfjs"

# URLs
PDF_URL = f"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/{PDFJS_VERSION}/pdf.min.js"
WORKER_URL = f"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/{PDFJS_VERSION}/pdf.worker.min.js"

def download_file(url, destination, description):
    """Télécharge un fichier avec barre de progression simple"""
    print(f"Téléchargement de {description}...")
    try:
        urllib.request.urlretrieve(url, destination)
        size = os.path.getsize(destination)
        print(f"  ✓ {description} téléchargé ({size:,} octets)")
        return True
    except Exception as e:
        print(f"  ✗ Erreur: {e}")
        return False

def main():
    print("=" * 50)
    print(f"Installation de PDF.js v{PDFJS_VERSION}")
    print("=" * 50)
    print()

    # Créer le dossier
    pdfjs_dir.mkdir(parents=True, exist_ok=True)
    print(f"Dossier créé: {pdfjs_dir}")
    print()

    # Télécharger les fichiers
    pdf_path = pdfjs_dir / "pdf.min.js"
    worker_path = pdfjs_dir / "pdf.worker.min.js"

    success = True
    success &= download_file(PDF_URL, pdf_path, "pdf.min.js")
    success &= download_file(WORKER_URL, worker_path, "pdf.worker.min.js")

    print()
    print("=" * 50)

    if success:
        print("Vérification des fichiers:")
        for f in pdfjs_dir.iterdir():
            size = f.stat().st_size
            print(f"  - {f.name}: {size:,} octets")

        print()
        print("✓ Installation terminée !")
        print(f"Les fichiers PDF.js sont dans: {pdfjs_dir}")
        print()
        print("Vous pouvez maintenant déconnecter le Raspberry Pi d'internet.")
        print("L'affichage des PDFs fonctionnera en mode offline.")
        return 0
    else:
        print("✗ Des erreurs sont survenues lors du téléchargement.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
