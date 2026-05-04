from flask import Flask, render_template, request, redirect, url_for, jsonify, send_from_directory
import json, os, uuid
from datetime import datetime

app = Flask(__name__)
DB_FILE = 'data.json'

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

def load_data():
    if not os.path.exists(DB_FILE):
        initial_data = {
            "annonce": "Bienvenue !",
            "taches": [],
            "moteurs": [],
            "collaborateurs": ["Bastien Z", "Florian C", "Mor F", "Pascal O", "Patrick L", "Sebastien B", "Silvain R"],
            "display": {"pages": [1, 2], "duree1": 30, "duree2": 30},
            "time_ref": 0
        }
        save_data(initial_data)
        return initial_data

    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        # Reset to initial data if file is corrupted
        initial_data = {
            "annonce": "Bienvenue !",
            "taches": [],
            "moteurs": [],
            "collaborateurs": ["Bastien Z", "Florian C", "Mor F", "Pascal O", "Patrick L", "Sebastien B", "Silvain R"],
            "display": {"pages": [1, 2], "duree1": 30, "duree2": 30},
            "time_ref": 0
        }
        save_data(initial_data)
        return initial_data

    # Migrations
    changed = False
    if 'collaborateurs' not in data:
        data['collaborateurs'] = ["Bastien Z", "Florian C", "Mor F", "Pascal O", "Patrick L", "Sebastien B", "Silvain R"]
        changed = True
    if 'moteurs' not in data:
        data['moteurs'] = []
        changed = True
    if 'display' not in data:
        data['display'] = {"pages": [1, 2], "duree1": 30, "duree2": 30}
        changed = True
    else:
        # Migration duree → duree1 + duree2
        if 'duree' in data['display'] and 'duree1' not in data['display']:
            d = data['display'].pop('duree')
            data['display']['duree1'] = d
            data['display']['duree2'] = d
            changed = True
        if 'duree1' not in data['display']:
            data['display']['duree1'] = 30
            changed = True
        if 'duree2' not in data['display']:
            data['display']['duree2'] = 30
            changed = True
    if 'time_ref' not in data:
        data['time_ref'] = 0
        changed = True
    for t in data.get('taches', []):
        if 'id' not in t:
            t['id'] = str(uuid.uuid4())[:8]
            changed = True
    for m in data.get('moteurs', []):
        if 'id' not in m:
            m['id'] = str(uuid.uuid4())[:8]
            changed = True
    if changed:
        save_data(data)
    return data

def save_data(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# ── PAGES ──────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    data = load_data()
    pages = data.get('display', {}).get('pages', [1, 2])
    first = pages[0] if pages else 1
    return redirect(url_for('display2') if first == 2 else url_for('display1'))

@app.route('/display1')
def display1():
    data = load_data()
    return render_template('display.html', data=data)

@app.route('/display2')
def display2():
    data = load_data()
    return render_template('display2.html', data=data)

@app.route('/admin')
def admin():
    data = load_data()
    ordre = {"haute": 1, "moyenne": 2, "basse": 3}
    data['taches'].sort(key=lambda x: ordre.get(x.get('priorite', 'basse'), 4))
    data['moteurs'].sort(key=lambda x: ordre.get(x.get('priorite', 'basse'), 4))
    return render_template('admin.html', data=data)

@app.route('/admin/settings')
def admin_settings():
    data = load_data()
    return render_template('admin_settings.html', data=data)

@app.route('/api/data')
def api_data():
    data = load_data()
    prio = {"haute": 1, "moyenne": 2, "basse": 3}
    data['taches'].sort(key=lambda x: prio.get(x.get('priorite', 'basse'), 4))
    data['moteurs'].sort(key=lambda x: prio.get(x.get('priorite', 'basse'), 4))
    return jsonify(data)

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
            t['texte']    = request.form.get('texte', '').strip() or t['texte']
            t['priorite'] = request.form.get('priorite', 'basse')
            t['equipe']   = ", ".join(request.form.getlist('equipe')) or "—"
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
            m['texte']       = request.form.get('texte', '').strip() or m['texte']
            m['emplacement'] = request.form.get('emplacement', '').strip() or "—"
            m['priorite']    = request.form.get('priorite', 'basse')
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
    pages = []
    if request.form.get('page1'): pages.append(1)
    if request.form.get('page2'): pages.append(2)
    if not pages: pages = [1]
    try:    duree1 = max(10, min(300, int(request.form.get('duree1', 30))))
    except: duree1 = 30
    try:    duree2 = max(10, min(300, int(request.form.get('duree2', 30))))
    except: duree2 = 30
    data['display'] = {"pages": pages, "duree1": duree1, "duree2": duree2}
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
    except: pass
    return redirect(url_for('admin_settings'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)