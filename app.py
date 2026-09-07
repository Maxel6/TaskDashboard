from flask import (Flask, render_template, request, redirect, url_for,
                   jsonify, send_from_directory)
from werkzeug.utils import secure_filename

import json
import os
import shutil
import tempfile
import threading
import unicodedata
import uuid
from datetime import datetime

# ── CONSTANTES ─────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads', 'pdfs')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DB_FILE = os.path.join(BASE_DIR, 'data.json')

# Aligné sur ce que display3.js sait afficher
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

DEFAULT_DATA = {
    "annonce": "Bienvenue !",
    "taches": [],
    "moteurs": [],
    "collaborateurs": ["Bastien Z", "Florian C", "Mor F", "Pascal O",
                       "Patrick L", "Sebastien B", "Silvain R"],
    "display": {"pages": [1, 2], "duree1": 30, "duree2": 30, "duree3": 30,
                "duree_media": 10},
    "time_ref": 0,
    "pdfs": [],
    "selected_pdfs": []
}

# Flask sert plusieurs requêtes en parallèle et l'affichage interroge
# /api/data toutes les 5 s : sans verrou, une lecture peut tomber pendant
# une écriture.
_DATA_LOCK = threading.RLock()
_LAST_GOOD = None

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_BYTES


# ── PERSISTANCE ────────────────────────────────────────────────────────
def _copy(obj):
    return json.loads(json.dumps(obj))


def save_data(data):
    """Écriture atomique : fichier temporaire + os.replace()."""
    global _LAST_GOOD
    with _DATA_LOCK:
        directory = os.path.dirname(DB_FILE) or '.'
        fd, tmp_path = tempfile.mkstemp(dir=directory, prefix='.data-', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, DB_FILE)
        except Exception:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise
        _LAST_GOOD = _copy(data)


def load_data():
    """Ne remet jamais les données à zéro sur une lecture concurrente."""
    global _LAST_GOOD
    with _DATA_LOCK:
        if not os.path.exists(DB_FILE):
            data = _copy(DEFAULT_DATA)
            save_data(data)
            return data

        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError, UnicodeDecodeError) as err:
            if _LAST_GOOD is not None:
                # écriture concurrente : on rend la dernière version saine
                return _copy(_LAST_GOOD)
            backup = f"{DB_FILE}.corrupt-{datetime.now():%Y%m%d-%H%M%S}"
            try:
                shutil.copy2(DB_FILE, backup)
            except OSError:
                backup = '(sauvegarde impossible)'
            print(f"[data] fichier illisible ({err}) — copie conservée dans {backup}")
            data = _copy(DEFAULT_DATA)
            save_data(data)
            return data

        if _migrate(data):
            save_data(data)
        else:
            _LAST_GOOD = _copy(data)
        return data


def _migrate(data):
    changed = False

    for key, default in DEFAULT_DATA.items():
        if key not in data:
            data[key] = _copy(default)
            changed = True

    display = data['display']
    if 'duree' in display and 'duree1' not in display:
        d = display.pop('duree')
        display['duree1'] = display['duree2'] = d
        changed = True
    for key in ('duree1', 'duree2', 'duree3'):
        if key not in display:
            display[key] = 30
            changed = True
    if 'duree_pdf' in display:
        del display['duree_pdf']
        changed = True
    if 'duree_media' not in display:
        display['duree_media'] = 10
        changed = True

    for item in data.get('taches', []) + data.get('moteurs', []):
        if 'id' not in item:
            item['id'] = str(uuid.uuid4())[:8]
            changed = True

    # une sélection ne doit référencer que des médias existants
    known = {m.get('id') for m in data.get('pdfs', [])}
    cleaned = [i for i in data.get('selected_pdfs', []) if i in known]
    if cleaned != data.get('selected_pdfs', []):
        data['selected_pdfs'] = cleaned
        changed = True

    return changed


# ── OUTILS MÉDIAS ──────────────────────────────────────────────────────
def build_stored_name(original_name):
    """
    secure_filename('Procédure.pdf') renvoie 'pdf' : l'accent est supprimé,
    le point de séparation devient le début du nom et l'extension disparaît.
    On translittère donc d'abord, et on recolle l'extension à la main.
    """
    base, ext = os.path.splitext(original_name or '')
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return None, None

    ascii_base = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode('ascii')
    clean = secure_filename(ascii_base).strip('._') or 'document'
    return f"{str(uuid.uuid4())[:8]}_{clean[:80]}{ext}", ext


def _remove_upload(filename):
    if not filename:
        return
    path = os.path.abspath(os.path.join(UPLOAD_FOLDER, filename))
    if not path.startswith(os.path.abspath(UPLOAD_FOLDER) + os.sep):
        print(f"[delete] chemin refusé : {filename}")
        return
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError as err:
            print(f"[delete] suppression impossible ({path}) : {err}")


# ── PAGES ──────────────────────────────────────────────────────────────
@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json',
                               mimetype='application/manifest+json')


@app.route('/')
def index():
    return redirect(url_for('dashboard'))


@app.route('/dashboard')
def dashboard():
    data = load_data()
    pages = data.get('display', {}).get('pages', [1, 2])
    first = pages[0] if pages else 1
    if first == 3:
        return redirect(url_for('display3'))
    if first == 2:
        return redirect(url_for('display2'))
    return redirect(url_for('display1'))


@app.route('/display1')
def display1():
    return render_template('display.html', data=load_data())


@app.route('/display2')
def display2():
    return render_template('display2.html', data=load_data())


@app.route('/display3')
def display3():
    return render_template('display3.html', data=load_data())


@app.route('/admin')
def admin():
    data = load_data()
    ordre = {"haute": 1, "moyenne": 2, "basse": 3}
    data['taches'].sort(key=lambda x: ordre.get(x.get('priorite', 'basse'), 4))
    data['moteurs'].sort(key=lambda x: ordre.get(x.get('priorite', 'basse'), 4))
    # les medias selectionnes remontent en tete, dans leur ordre de diffusion
    rang = {pdf_id: i for i, pdf_id in enumerate(data['selected_pdfs'])}
    data['pdfs'].sort(key=lambda m: rang.get(m.get('id'), len(rang)))
    return render_template('admin.html', data=data)


@app.route('/admin/settings')
def admin_settings():
    return render_template('admin_settings.html', data=load_data())


@app.route('/api/data')
def api_data():
    data = load_data()
    prio = {"haute": 1, "moyenne": 2, "basse": 3}
    data['taches'].sort(key=lambda x: prio.get(x.get('priorite', 'basse'), 4))
    data['moteurs'].sort(key=lambda x: prio.get(x.get('priorite', 'basse'), 4))
    response = jsonify(data)
    response.headers['Cache-Control'] = 'no-store'
    return response


# ── ANNONCE ────────────────────────────────────────────────────────────
@app.route('/update_annonce', methods=['POST'])
def update_annonce():
    data = load_data()
    data['annonce'] = request.form.get('annonce', '').strip()  # vide autorisé
    save_data(data)
    return redirect(url_for('admin'))


# ── TÂCHES ─────────────────────────────────────────────────────────────
@app.route('/add_task', methods=['POST'])
def add_task():
    data = load_data()
    texte = request.form.get('tache', '').strip()
    if texte:
        data['taches'].append({
            "id": str(uuid.uuid4())[:8],
            "texte": texte,
            "priorite": request.form.get('priorite', 'basse'),
            "equipe": ", ".join(request.form.getlist('equipe')) or "—"
        })
        save_data(data)
    return redirect(url_for('admin'))


@app.route('/edit_task/<task_id>', methods=['POST'])
def edit_task(task_id):
    data = load_data()
    for t in data['taches']:
        if t.get('id') == task_id:
            t['texte'] = request.form.get('texte', '').strip() or t['texte']
            t['priorite'] = request.form.get('priorite', 'basse')
            t['equipe'] = ", ".join(request.form.getlist('equipe')) or "—"
            break
    save_data(data)
    return redirect(url_for('admin'))


@app.route('/delete_task/<task_id>')
def delete_task(task_id):
    data = load_data()
    data['taches'] = [t for t in data['taches'] if t.get('id') != task_id]
    save_data(data)
    return redirect(url_for('admin'))


@app.route('/delete_all')
def delete_all():
    data = load_data()
    data['taches'] = []
    save_data(data)
    return redirect(url_for('admin'))


# ── MOTEURS ────────────────────────────────────────────────────────────
@app.route('/add_moteur', methods=['POST'])
def add_moteur():
    data = load_data()
    texte = request.form.get('texte', '').strip()
    if texte:
        data['moteurs'].append({
            "id": str(uuid.uuid4())[:8],
            "texte": texte,
            "emplacement": request.form.get('emplacement', '').strip() or "—",
            "priorite": request.form.get('priorite', 'basse')
        })
        save_data(data)
    return redirect(url_for('admin') + '#page2')


@app.route('/edit_moteur/<moteur_id>', methods=['POST'])
def edit_moteur(moteur_id):
    data = load_data()
    for m in data['moteurs']:
        if m.get('id') == moteur_id:
            m['texte'] = request.form.get('texte', '').strip() or m['texte']
            m['emplacement'] = request.form.get('emplacement', '').strip() or "—"
            m['priorite'] = request.form.get('priorite', 'basse')
            break
    save_data(data)
    return redirect(url_for('admin') + '#page2')


@app.route('/delete_moteur/<moteur_id>')
def delete_moteur(moteur_id):
    data = load_data()
    data['moteurs'] = [m for m in data['moteurs'] if m.get('id') != moteur_id]
    save_data(data)
    return redirect(url_for('admin') + '#page2')


@app.route('/delete_all_moteurs')
def delete_all_moteurs():
    data = load_data()
    data['moteurs'] = []
    save_data(data)
    return redirect(url_for('admin') + '#page2')


# ── COLLABORATEURS ─────────────────────────────────────────────────────
@app.route('/add_collaborateur', methods=['POST'])
def add_collaborateur():
    data = load_data()
    nom = request.form.get('nom', '').strip()
    if nom and nom not in data['collaborateurs']:
        data['collaborateurs'].append(nom)
        data['collaborateurs'].sort()
        save_data(data)
    return redirect(url_for('admin_settings'))


@app.route('/delete_collaborateur/<int:collab_id>')
def delete_collaborateur(collab_id):
    data = load_data()
    if 0 <= collab_id < len(data['collaborateurs']):
        data['collaborateurs'].pop(collab_id)
        save_data(data)
    return redirect(url_for('admin_settings'))


# ── AFFICHAGE ──────────────────────────────────────────────────────────
@app.route('/update_display', methods=['POST'])
def update_display():
    data = load_data()

    pages = [n for n in (1, 2, 3) if request.form.get(f'page{n}')]
    if not pages:
        pages = [1]

    durees = {}
    for n in (1, 2, 3):
        try:
            durees[f'duree{n}'] = max(10, min(300, int(request.form.get(f'duree{n}', 30))))
        except (TypeError, ValueError):
            durees[f'duree{n}'] = 30

    data['display'].update({"pages": pages, **durees})
    save_data(data)
    return redirect(url_for('admin_settings'))


# ── HEURE ──────────────────────────────────────────────────────────────
@app.route('/update_time', methods=['POST'])
def update_time():
    data = load_data()
    try:
        user_time = datetime.fromisoformat(request.form.get('datetime', ''))
        data['time_ref'] = (user_time - datetime.now()).total_seconds()
        save_data(data)
    except (TypeError, ValueError):
        pass
    return redirect(url_for('admin_settings'))


# ── MÉDIAS (PDFs et images) ────────────────────────────────────────────
@app.route('/upload_file', methods=['POST'])
def upload_file():
    files = request.files.getlist('file')
    if not files:
        return redirect(url_for('admin') + '#page3')

    data = load_data()
    added = False

    for file in files:
        if not file or not file.filename:
            continue

        stored_name, ext = build_stored_name(file.filename)
        if not stored_name:
            print(f"[upload] extension refusée : {file.filename}")
            continue

        filepath = os.path.join(UPLOAD_FOLDER, stored_name)
        file.save(filepath)

        if os.path.getsize(filepath) == 0:
            os.remove(filepath)
            print(f"[upload] fichier vide ignoré : {file.filename}")
            continue

        data['pdfs'].append({
            "id": str(uuid.uuid4())[:8],
            "original_name": file.filename,
            "filename": stored_name,
            "type": "pdf" if ext == '.pdf' else "image",
            "uploaded_at": datetime.now().isoformat()
        })
        added = True

    if added:
        save_data(data)
    return redirect(url_for('admin') + '#page3')


# /delete_pdf est le chemin utilisé par admin.html, /delete_file reste
# disponible comme alias.
@app.route('/delete_pdf/<file_id>')
@app.route('/delete_file/<file_id>')
def delete_file(file_id):
    data = load_data()
    target = next((f for f in data['pdfs'] if f.get('id') == file_id), None)

    if target:
        _remove_upload(target.get('filename'))
        data['pdfs'] = [f for f in data['pdfs'] if f.get('id') != file_id]
        data['selected_pdfs'] = [i for i in data['selected_pdfs'] if i != file_id]
        save_data(data)

    return redirect(url_for('admin') + '#page3')


@app.route('/delete_all_pdfs')
def delete_all_pdfs():
    data = load_data()
    for media in data['pdfs']:
        _remove_upload(media.get('filename'))
    data['pdfs'] = []
    data['selected_pdfs'] = []
    save_data(data)
    return redirect(url_for('admin') + '#page3')


@app.route('/update_selected_pdfs', methods=['POST'])
def update_selected_pdfs():
    data = load_data()
    known = {m.get('id') for m in data['pdfs']}

    # l'ordre des cases dans le formulaire = ordre de diffusion sur l'ecran
    selection, seen = [], set()
    for pdf_id in request.form.getlist('selected_pdfs'):
        if pdf_id in known and pdf_id not in seen:
            selection.append(pdf_id)
            seen.add(pdf_id)
    data['selected_pdfs'] = selection

    try:
        duree_media = max(3, min(300, int(request.form.get('duree_media', 10))))
    except (TypeError, ValueError):
        duree_media = 10
    data['display']['duree_media'] = duree_media

    save_data(data)
    return redirect(url_for('admin') + '#page3')


@app.route('/uploads/pdfs/<path:filename>')
@app.route('/uploads/files/<path:filename>')
def serve_pdf(filename):
    # les noms stockés sont uniques et immuables : cache long côté écran
    response = send_from_directory(UPLOAD_FOLDER, filename, conditional=True)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response


@app.errorhandler(413)
def upload_too_large(_err):
    print("[upload] fichier refusé : taille supérieure à la limite")
    return redirect(url_for('admin') + '#page3')


if __name__ == '__main__':
    debug = os.environ.get('DASHBOARD_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=5001, debug=debug)