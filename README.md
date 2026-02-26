# TaskDashboard

A lightweight, self-hosted maintenance task management system designed for industrial environments. Built with Flask and deployed on a Raspberry Pi, it provides a real-time TV display for workshop floors and a mobile-optimized admin interface for team supervisors.

---

## Overview

TaskDashboard solves a simple problem: keeping maintenance teams aligned without relying on paper boards, shared spreadsheets, or expensive software. Tasks are managed from any phone on the local network and displayed in real time on a screen in the workshop.

The system runs entirely offline on a local network — no internet connection required in production.

---

## Features

### TV Display
- Full-screen dashboard designed for wall-mounted screens
- Real-time task updates every 5 seconds without page reload
- Tasks sorted and color-coded by priority (high / medium / low)
- Animated priority indicators with a pulsing glow for critical tasks
- Multi-page rotation with configurable duration and smooth progress bar
- Scrolling announcement banner with seamless loop
- Compact mode automatically activates when task count increases

### Admin Interface
- Mobile-first design, optimized for phone use
- Accordion task list — collapsed by default for readability, tap to expand and edit
- Add, edit, and delete tasks with team assignment and priority selection
- Tasks sorted by priority automatically
- Announcement management
- Display configuration: select active pages and set rotation duration (10s → 5min)

### Team Management
- Add and remove team members
- Members available as assignees across all tasks
- Avatar initials and animated list

### Technical
- Unique ID per task — edits and deletions are always accurate regardless of sort order
- Settings applied reactively — changing display config from the admin takes effect on screen within 5 seconds, no manual refresh needed
- PWA-ready: installable on iOS and Android home screens
- Fully offline: fonts and all assets served locally

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| Frontend | Vanilla JS, CSS (no frameworks) |
| Typography | Bebas Neue, DM Sans (self-hosted) |
| Data | JSON flat file |
| Deployment | Raspberry Pi, local network |

---

## Project Structure

```
taskdashboard/
├── app.py                        # Flask routes and data logic
├── data.json                     # Runtime data (tasks, team, settings)
├── templates/
│   ├── display.html              # TV dashboard — page 1
│   ├── display2.html             # TV dashboard — page 2
│   ├── admin.html                # Admin interface
│   └── admin_collaborateurs.html # Team management
└── static/
    ├── css/
    │   ├── display.css
    │   ├── display2.css
    │   ├── admin.css
    │   └── admin_collaborateurs.css
    ├── js/
    │   ├── display.js
    │   ├── display2.js
    │   └── admin.js
    ├── fonts/
    │   ├── BebasNeue-Regular.ttf
    │   └── DMSans-VariableFont_opsz,wght.ttf
    ├── img/
    │   └── logo.png
    └── manifest.json             # PWA manifest
```

---

## Getting Started

### Requirements

- Python 3.8+
- pip

### Installation

```bash
git clone https://github.com/Maxel6/TaskDashboard.git
cd TaskDashboard
python3 -m venv venv
source venv/bin/activate
pip install flask
python app.py
```

The server starts on `http://0.0.0.0:5001`.

### Routes

| URL | Description |
|---|---|
| `/dashboard` | Entry point — redirects to the first active page |
| `/display1` | TV dashboard page 1 (tasks) |
| `/display2` | TV dashboard page 2 |
| `/admin` | Task and settings management |
| `/admin/collaborateurs` | Team member management |
| `/api/data` | JSON API used by the frontend |

---

## Deployment on Raspberry Pi

```bash
# On the Pi, clone the repo
git clone https://github.com/Maxel6/TaskDashboard.git

# Install dependencies
pip3 install flask

# Run on startup (example with systemd or cron @reboot)
python3 app.py
```

Point a browser in kiosk mode to `http://localhost:5001/dashboard` for the TV display. Access the admin from any device on the same network at `http://<pi-ip>:5001/admin`.

To update after changes:
```bash
git pull
```

---

## Data

All data is stored in `data.json` at the project root. The file is created automatically on first run with default values.

```json
{
    "annonce": "Welcome message",
    "taches": [],
    "collaborateurs": [],
    "display": {
        "pages": [1, 2],
        "duree": 30
    }
}
```

Add `data.json` to `.gitignore` to avoid versioning team names and task content.

---

## .gitignore

```
data.json
venv/
__pycache__/
*.pyc
```

