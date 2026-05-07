let timeRefSeconds = 0;
const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const DAYS   = ['DIM','LUN','MAR','MER','JEU','VEN','SAM'];

function updateClock() {
    const now = new Date(Date.now() + timeRefSeconds * 1000);
    const clockEl = document.getElementById('clock');
    const dateEl  = document.getElementById('date');
    if (clockEl) clockEl.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    if (dateEl)  dateEl.textContent  = DAYS[now.getDay()] + ' ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
}
setInterval(updateClock, 1000);
updateClock();

let lastTachesHash  = null;
let lastAnnonce     = null;
let lastDisplayHash = null;

const pColor = { haute: '#ef4444', moyenne: '#f59e0b', basse: '#10b981' };
const pLabel = { haute: 'Haute',   moyenne: 'Moyenne', basse: 'Basse'  };

function buildCard(t, titleSize, teamSize) {
    const color = pColor[t.priorite] || '#10b981';
    const label = pLabel[t.priorite] || t.priorite;
    return `
        <li class="task-item prio-${t.priorite}" style="opacity:1">
            <div class="task-info">
                <div class="task-title" style="font-size:${titleSize}">${t.texte}</div>
                <div class="task-team" style="font-size:${teamSize}">📍 ${t.emplacement}</div>
            </div>
            <div class="side-block" style="display:flex;justify-content:flex-end">
                <div class="priority-badge" style="border:1px solid ${color}50;color:${color}">
                    <span class="badge-dot" style="background:${color}"></span>
                    ${label}
                </div>
            </div>
        </li>`;
}

function updateTaches(moteurs) {
    const hash = JSON.stringify(moteurs);
    if (hash === lastTachesHash) return;
    lastTachesHash = hash;
    const list = document.getElementById('task-list');
    const nb   = moteurs.length;
    list.classList.toggle('mode-compact', nb > 4 && nb <= 8);
    list.classList.toggle('mode-2col',    nb > 8);
    const titleSize = nb <= 3 ? '2.6rem' : nb <= 5 ? '2.0rem' : nb <= 8 ? '1.5rem' : '1.1rem';
    const teamSize  = nb <= 3 ? '1.4rem' : nb <= 5 ? '1.15rem' : nb <= 8 ? '0.95rem' : '0.8rem';
    const ordre = { haute: 1, moyenne: 2, basse: 3 };
    const sorted = [...moteurs].sort((a, b) => (ordre[a.priorite] || 4) - (ordre[b.priorite] || 4));
    list.innerHTML = sorted.map(t => buildCard(t, titleSize, teamSize)).join('');
}

function updateAnnonce(annonce) {
    if (annonce === lastAnnonce) return;
    lastAnnonce = annonce;
    const t1     = document.getElementById('annonce-text');
    const t2     = document.getElementById('annonce-text2');
    const scroll = document.getElementById('annonce-scroll');
    if (!t1 || !t2 || !scroll) return;
    t1.textContent = annonce;
    t2.textContent = annonce;
    if (!annonce) return;
    void t1.offsetWidth;
    const w        = t1.offsetWidth + 80;
    const duration = Math.max(6, w / 120);
    scroll.style.setProperty('--marquee-duration', duration + 's');
}

const fill          = document.getElementById('progress-fill');
const progressTrack = document.querySelector('.progress-track');
const t0            = Date.now();
let   SWITCH_MS     = 30 * 1000;
let   pages_active  = [1, 2];
let   switchTimer   = null;

function applyDisplaySettings(display) {
    if (!display) return;
    const displayKey = JSON.stringify(display);
    if (displayKey === lastDisplayHash) return;
    lastDisplayHash = displayKey;
    const newPages = display.pages || [1, 2];
    const newDuree = (display.duree2 || 30) * 1000;
    if (!newPages.includes(2)) {
        const target = newPages.includes(1) ? '/display1' : newPages.includes(3) ? '/display3' : '/dashboard';
        window.location.href = target;
        return;
    }
    const multiPage = newPages.length > 1;
    if (progressTrack) progressTrack.style.display = multiPage ? 'block' : 'none';
    document.querySelectorAll('.page-dot').forEach((dot, i) => {
        dot.style.display = newPages.includes(i + 1) ? 'block' : 'none';
    });
    SWITCH_MS    = newDuree;
    pages_active = newPages;
    if (switchTimer) clearTimeout(switchTimer);
    if (multiPage) {
        // Determine next page in rotation
        const currentIndex = newPages.indexOf(2);
        const nextIndex = (currentIndex + 1) % newPages.length;
        const nextPage = newPages[nextIndex];
        const target = nextPage === 1 ? '/display1' : nextPage === 2 ? '/display2' : '/display3';
        switchTimer = setTimeout(() => { window.location.href = target; }, SWITCH_MS);
    }
}

function updateProgressBar() {
    if (pages_active.length > 1 && fill) {
        const elapsed = Date.now() - t0;
        const progress = Math.min((elapsed / SWITCH_MS) * 100, 100);
        fill.style.width = progress + '%';
    }
    requestAnimationFrame(updateProgressBar);
}
requestAnimationFrame(updateProgressBar);

const STORAGE_KEY_T = 'tasks_count';
const STORAGE_KEY_M = 'moteurs_count';
const notifAudio    = new Audio('/static/sounds/notification.wav');
notifAudio.preload  = 'auto';

let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    notifAudio.play().then(() => { notifAudio.pause(); notifAudio.currentTime = 0; }).catch(() => {});
}
document.addEventListener('click',      unlockAudio, { once: false });
document.addEventListener('touchstart', unlockAudio, { once: false });

function playBeep() {
    try { notifAudio.currentTime = 0; notifAudio.play(); } catch(e) {}
}

function checkNotifications(data) {
    if (localStorage.getItem('notif') === 'off') return;
    const prevT = parseInt(localStorage.getItem(STORAGE_KEY_T) ?? '-1');
    const prevM = parseInt(localStorage.getItem(STORAGE_KEY_M) ?? '-1');
    const currT = (data.taches  || []).length;
    const currM = (data.moteurs || []).length;
    const newT  = prevT >= 0 && currT > prevT;
    const newM  = prevM >= 0 && currM > prevM;
    if (newT || newM) {
        playBeep();
    }
    localStorage.setItem(STORAGE_KEY_T, currT);
    localStorage.setItem(STORAGE_KEY_M, currM);
}

if (localStorage.getItem('notif_pending') === '1' && localStorage.getItem('notif') !== 'off') {
    localStorage.removeItem('notif_pending');
    window.addEventListener('load', () => setTimeout(playBeep, 800));
}

async function refreshData() {
    try {
        const res  = await fetch('/api/data');
        const data = await res.json();
        if (data.time_ref !== undefined) timeRefSeconds = data.time_ref;
        applyDisplaySettings(data.display);
        updateAnnonce(data.annonce);
        checkNotifications(data);
        updateTaches(data.moteurs);
    } catch(e) { console.error(e); }
}

setInterval(refreshData, 5000);
refreshData();