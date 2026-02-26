let lastHash = null;

function hashData(data) {
    return JSON.stringify(data.taches) + '||' + data.annonce;
}

const pColor = { haute: '#ef4444', moyenne: '#f59e0b', basse: '#10b981' };
const pLabel = { haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse' };

function buildCard(t, i, titleSize, teamSize, animate) {
    const color = pColor[t.priorite] || '#10b981';
    const label = pLabel[t.priorite] || t.priorite;
    const animStyle = animate
        ? `animation-delay:${i * 90}ms`
        : `opacity:1;transform:translateY(0);animation:none`;
    return `
        <li class="task-item prio-${t.priorite}" style="${animStyle}">
            <div class="task-info">
                <div class="task-title" style="font-size:${titleSize}">${t.texte}</div>
                <div class="task-team" style="font-size:${teamSize}">Équipe · ${t.equipe}</div>
            </div>
            <div class="side-block" style="display:flex;justify-content:flex-end">
                <div class="priority-badge" style="border:1px solid ${color}50;color:${color}">
                    <span class="badge-dot" style="background:${color}"></span>
                    ${label}
                </div>
            </div>
        </li>`;
}

function updateAnnonce(annonce) {
    const el = document.getElementById('annonce-text');
    const scroll = el.parentElement;
    if (el.dataset.raw === annonce) return;
    el.dataset.raw = annonce;

    el.classList.remove('scrolling');
    scroll.classList.remove('scrolling');
    el.style.animation = 'none';
    el.textContent = annonce;
    void el.offsetWidth;

    requestAnimationFrame(() => {
        const sep = '            ';
        if (el.scrollWidth > scroll.clientWidth) {
            el.textContent = annonce + sep + annonce + sep;
            const offsetPx = el.scrollWidth / 2;
            el.style.removeProperty('animation');
            el.style.setProperty('--marquee-offset', `-${offsetPx}px`);
            el.style.setProperty('--marquee-duration', `${offsetPx / 90}s`);
            el.classList.add('scrolling');
            scroll.classList.add('scrolling');
        } else {
            el.style.removeProperty('animation');
        }
    });
}

const fill = document.getElementById('progress-fill');
const progressTrack = document.querySelector('.progress-track');
const t0 = Date.now();
let SWITCH_MS = 30 * 1000;
let pages_active = [1, 2];
let switchTimer = null;
let lastDisplay = null;

function applyDisplaySettings(display) {
    if (!display) return;

    const newPages = display.pages || [1, 2];
    const newDuree = (display.duree || 30) * 1000;
    const displayKey = JSON.stringify(display);

    if (!newPages.includes(1)) {
        window.location.href = newPages.includes(2) ? '/display2' : '/dashboard';
        return;
    }

    if (displayKey === lastDisplay) return;
    lastDisplay = displayKey;

    const multiPage = newPages.length > 1;
    if (progressTrack) progressTrack.style.display = multiPage ? 'block' : 'none';
    document.querySelectorAll('.page-dot').forEach((dot, i) => {
        dot.style.display = newPages.includes(i + 1) ? 'block' : 'none';
    });

    SWITCH_MS = newDuree;
    pages_active = newPages;

    if (switchTimer) clearTimeout(switchTimer);
    if (multiPage) {
        switchTimer = setTimeout(() => {
            window.location.href = '/display2';
        }, SWITCH_MS);
    }
}

setInterval(() => {
    if (pages_active.length > 1) {
        const pct = Math.min(((Date.now() - t0) / SWITCH_MS) * 100, 100);
        fill.style.width = pct + '%';
    }
}, 1000);

async function refreshData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();

        applyDisplaySettings(data.display);
        updateAnnonce(data.annonce);

        const hash = hashData(data);
        if (hash === lastHash) return;
        const firstRender = lastHash === null;
        lastHash = hash;

        const list = document.getElementById('task-list');
        const nb = data.taches.length;

        list.classList.toggle('mode-compact', nb > 4);

        const titleSize = nb <= 3 ? '2.6rem' : nb <= 5 ? '2.0rem' : '1.5rem';
        const teamSize = nb <= 3 ? '1.4rem' : nb <= 5 ? '1.15rem' : '0.95rem';

        list.innerHTML = data.taches.map((t, i) =>
            buildCard(t, i, titleSize, teamSize, firstRender)
        ).join('');

    } catch (e) { console.error(e); }
}

setInterval(refreshData, 5000);
refreshData();