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

    if (!newPages.includes(2)) {
        window.location.href = newPages.includes(1) ? '/display1' : '/dashboard';
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
            window.location.href = '/display1';
        }, SWITCH_MS);
    }
}

setInterval(() => {
    if (pages_active.length > 1) {
        const pct = Math.min(((Date.now() - t0) / SWITCH_MS) * 100, 100);
        fill.style.width = pct + '%';
    }
}, 1000);

async function refreshAnnonce() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();

        applyDisplaySettings(data.display);

        const el = document.getElementById('annonce-text');
        const scroll = el.parentElement;
        if (el.dataset.raw === data.annonce) return;
        el.dataset.raw = data.annonce;
        el.classList.remove('scrolling');
        scroll.classList.remove('scrolling');
        el.style.animation = 'none';
        el.textContent = data.annonce;
        void el.offsetWidth;
        requestAnimationFrame(() => {
            if (el.scrollWidth > scroll.clientWidth) {
                const sep = '            ';
                el.textContent = data.annonce + sep + data.annonce + sep;
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
    } catch (e) { console.error(e); }
}

setInterval(refreshAnnonce, 5000);
refreshAnnonce();