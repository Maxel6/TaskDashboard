from flask import Flask, render_template, request, redirect, url_for, jsonify, send_from_directory
import json
import os
import uuid

app = Flask(__name__)
DB_FILE = 'data.json'

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

def load_data():
    if not os.path.exists(DB_FILE):
        initial_data = {"annonce": "Bienvenue !", "taches": [], "collaborateurs": [
            "Bastien Z", "Florian C", "Mor F", "Pascal O", "Patrick L", "Sebastien B", "Silvain R"
        ]}
        save_data(initial_data)
        return initial_data
    data = json.load(open(DB_FILE, 'r', encoding='utf-8'))
    if 'collaborateurs' not in data:
        data['collaborateurs'] = [
            "Bastien Z", "Florian C", "Mor F", "Pascal O", "Patrick L", "Sebastien B", "Silvain R"
        ]
        save_data(data)
    changed = False
    for tache in data.get('taches', []):
        if 'id' not in tache:
            tache['id'] = str(uuid.uuid4())[:8]
            changed = True
    if changed:
        save_data(data)

    if 'display' not in data:
        data['display'] = {"pages": [1, 2], "duree": 30}
        save_data(data)
    return data

def save_data(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


@app.route('/')
def index():
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    """Point d'entrée de l'écran — redirige vers la première page active."""
    data = load_data()
    pages = data.get('display', {}).get('pages', [1, 2])
    first = pages[0] if pages else 1
    if first == 2:
        return redirect(url_for('display2'))
    return redirect(url_for('display1'))

@app.route('/display1')
def display1():
    data = load_data()
    ordre_priorite = {"haute": 1, "moyenne": 2, "basse": 3}
    data['taches'].sort(key=lambda x: ordre_priorite.get(x.get('priorite', 'basse'), 4))
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
    return render_template('admin.html', data=data)

@app.route('/admin/collaborateurs')
def admin_collaborateurs():
    data = load_data()
    return render_template('admin_collaborateurs.html', data=data)

@app.route('/add_collaborateur', methods=['POST'])
def add_collaborateur():
    data = load_data()
    nom = request.form.get('nom', '').strip()
    if nom and nom not in data['collaborateurs']:
        data['collaborateurs'].append(nom)
        data['collaborateurs'].sort()
        save_data(data)
    return redirect(url_for('admin_collaborateurs'))

@app.route('/delete_collaborateur/<int:collab_id>')
def delete_collaborateur(collab_id):
    data = load_data()
    if 0 <= collab_id < len(data['collaborateurs']):
        data['collaborateurs'].pop(collab_id)
        save_data(data)
    return redirect(url_for('admin_collaborateurs'))

@app.route('/update_display', methods=['POST'])
def update_display():
    data = load_data()
    pages = []
    if request.form.get('page1'): pages.append(1)
    if request.form.get('page2'): pages.append(2)
    if not pages: pages = [1]
    data['display'] = {
        "pages": pages,
        "duree": int(request.form.get('duree', 30))
    }
    save_data(data)
    return redirect(url_for('admin'))

@app.route('/update_annonce', methods=['POST'])
def update_annonce():
    data = load_data()
    data['annonce'] = request.form.get('annonce')
    save_data(data)
    return redirect(url_for('admin'))

@app.route('/add_task', methods=['POST'])
def add_task():
    data = load_data()
    nouvelle_tache = {
        "id": str(uuid.uuid4())[:8],
        "texte": request.form.get('tache'),
        "priorite": request.form.get('priorite'),
        "equipe": ", ".join(request.form.getlist('equipe')) or "—"
    }
    if nouvelle_tache["texte"]:
        data['taches'].append(nouvelle_tache)
        save_data(data)
    return redirect(url_for('admin'))

@app.route('/edit_task/<task_id>', methods=['POST'])
def edit_task(task_id):
    data = load_data()
    for tache in data['taches']:
        if tache.get('id') == task_id:
            tache['texte']   = request.form.get('texte')
            tache['priorite'] = request.form.get('priorite')
            tache['equipe']  = ", ".join(request.form.getlist('equipe')) or "—"
            break
    save_data(data)
    return redirect(url_for('admin'))

@app.route('/api/data')
def api_data():
    data = load_data()
    prio_map = {"haute": 1, "moyenne": 2, "basse": 3}
    data['taches'].sort(key=lambda x: prio_map.get(x.get('priorite', 'basse'), 4))
    return jsonify(data)

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)