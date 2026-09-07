'use strict';

/* ============================================================================
   Page 3 — affichage plein écran de PDFs et d'images.

   Rendu :
   - une playlist plate de "slides" (1 slide = 1 page de PDF, ou 1 image) ;
   - le rendu est calé sur la taille RÉELLE du conteneur, pas sur window ;
   - le PDF est rendu à devicePixelRatio (résolution max utile) puis contenu
     entièrement dans la scène : jamais de rognage, jamais de scroll ;
   - un jeton "generation" invalide tout rendu asynchrone devenu obsolète.

   Diffusion :
   - `selected_pdfs` est une liste ORDONNÉE : son ordre pilote la diffusion ;
   - chaque page (ou image) reste affichée `duree_media` secondes ;
   - la page 3 rend la main aux pages 1/2 après `duree3` secondes, puis REPREND
     au cycle suivant là où elle s'était arrêtée : aucun document n'est
     condamné à ne jamais passer ;
   - un seul média sélectionné = affichage permanent, sans rotation.
   ========================================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/js/pdfjs/pdf.worker.min.js';

const CONFIG = {
    API_URL: '/api/data',
    MEDIA_BASE: '/uploads/pdfs/',
    REFRESH_MS: 5000,
    DEFAULT_MEDIA_SECONDS: 10,   // durée d'une page/image, réglable dans l'admin
    MIN_SLIDE_MS: 3000,
    RESIZE_DEBOUNCE_MS: 200,
    POSITION_KEY: 'display3.position',
    MAX_CANVAS_DIM: 8192,      // garde-fous navigateur
    MAX_CANVAS_AREA: 32 * 1024 * 1024,
    IMAGE_EXT: /\.(png|jpe?g|jfif|pjpeg|webp|gif|bmp|avif|svg)$/i,
    PDF_EXT: /\.pdf$/i
};

const dom = {
    container: document.getElementById('pdf-container'),
    pdfWrapper: document.getElementById('pdf-wrapper'),
    canvas: document.getElementById('pdf-canvas'),
    imageWrapper: document.getElementById('image-wrapper'),
    imageViewer: document.getElementById('image-viewer'),
    mediaError: document.getElementById('media-error'),
    noMedia: document.getElementById('no-pdf'),
    loader: document.getElementById('loader'),
    info: document.getElementById('pdf-info'),
    name: document.getElementById('pdf-name'),
    page: document.getElementById('pdf-page'),
    progress: document.getElementById('pdf-progress'),
    footerFill: document.getElementById('progress-fill'),
    clock: document.getElementById('clock'),
    date: document.getElementById('date'),
    annonce1: document.getElementById('annonce-text'),
    annonce2: document.getElementById('annonce-text2')
};

const ctx = dom.canvas.getContext('2d', { alpha: false });

const state = {
    media: [],
    selectedIds: [],
    slides: [],
    slideIndex: 0,
    signature: '',
    slideMs: CONFIG.DEFAULT_MEDIA_SECONDS * 1000,
    mediaSeconds: CONFIG.DEFAULT_MEDIA_SECONDS,
    generation: 0,
    page3Duration: 30,
    lastPlaylistHash: null,
    lastDisplayHash: null,
    lastAnnonce: null
};

const docCache = new Map();     // filename -> Promise<PDFDocumentProxy|null>
let renderTask = null;
let slideTimer = null;
let switchTimer = null;
let resizeTimer = null;
let footerTimer = null;

/* ---------------------------------------------------------------- helpers */

function isImage(f) { return CONFIG.IMAGE_EXT.test(f || ''); }
function isPdf(f) { return CONFIG.PDF_EXT.test(f || ''); }
function mediaUrl(f) { return CONFIG.MEDIA_BASE + encodeURIComponent(f); }

function displayName(item) {
    const raw = item.original_name || item.filename || '';
    return raw
        .replace(/\.[^.]+$/, '')            // extension
        .replace(/^[a-f0-9]{6,}[_-]/i, '')  // préfixe uuid/hash de l'upload
        .replace(/[_-]+/g, ' ')
        .trim() || 'Document';
}

function stageSize() {
    const r = dom.container.getBoundingClientRect();
    return {
        width: Math.max(1, r.width || dom.container.clientWidth || window.innerWidth),
        height: Math.max(1, r.height || dom.container.clientHeight || window.innerHeight)
    };
}

function setLoading(on) {
    dom.loader.classList.toggle('visible', !!on);
}

function showScene(scene) {   // 'pdf' | 'image' | 'error' | 'none'
    dom.pdfWrapper.classList.toggle('hidden', scene !== 'pdf');
    dom.imageWrapper.classList.toggle('hidden', scene !== 'image');
    dom.mediaError.classList.toggle('hidden', scene !== 'error');
    dom.noMedia.classList.toggle('hidden', scene !== 'none');
    dom.info.classList.toggle('visible', scene === 'pdf' || scene === 'image');
}

/* ------------------------------------------------- position persistante */

function readPosition(signature) {
    try {
        const raw = localStorage.getItem(CONFIG.POSITION_KEY);
        if (!raw) return 0;
        const saved = JSON.parse(raw);
        if (saved.signature !== signature) return 0;   // la playlist a changé
        return Number(saved.index) || 0;
    } catch (_) {
        return 0;
    }
}

function writePosition() {
    try {
        localStorage.setItem(CONFIG.POSITION_KEY, JSON.stringify({
            signature: state.signature,
            index: state.slideIndex
        }));
    } catch (_) { /* mode privé ou stockage plein : sans conséquence */ }
}


/* ------------------------------------------------------------- documents */

function getDoc(filename) {
    if (docCache.has(filename)) return docCache.get(filename);
    const p = pdfjsLib.getDocument({ url: mediaUrl(filename) }).promise
        .catch(err => {
            console.error('[display3] PDF illisible :', filename, err);
            return null;
        });
    docCache.set(filename, p);
    return p;
}

async function pruneDocCache(keep) {
    for (const [filename, promise] of Array.from(docCache.entries())) {
        if (keep.has(filename)) continue;
        docCache.delete(filename);
        try { const doc = await promise; if (doc) doc.destroy(); } catch (_) { /* ignore */ }
    }
}

/* ---------------------------------------------------------------- rendu */

async function renderPdfSlide(slide, gen, silent) {
    const doc = await getDoc(slide.filename);
    if (!doc || gen !== state.generation) return !!doc;

    const page = await doc.getPage(slide.pageNum);
    if (gen !== state.generation) return true;

    const box = stageSize();
    const base = page.getViewport({ scale: 1 });
    const dpr = window.devicePixelRatio || 1;

    // échelle d'affichage : la page entière tient dans la scène
    const cssScale = Math.min(box.width / base.width, box.height / base.height);

    // échelle de rendu : cssScale * dpr, bridée par les limites canvas
    const renderScale = Math.min(
        cssScale * dpr,
        CONFIG.MAX_CANVAS_DIM / base.width,
        CONFIG.MAX_CANVAS_DIM / base.height,
        Math.sqrt(CONFIG.MAX_CANVAS_AREA / (base.width * base.height))
    );

    const viewport = page.getViewport({ scale: renderScale });

    // rendu hors écran puis blit : pas de flash blanc pendant le rendu
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.floor(viewport.width));
    off.height = Math.max(1, Math.floor(viewport.height));
    const offCtx = off.getContext('2d', { alpha: false });
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, off.width, off.height);

    if (renderTask) { try { renderTask.cancel(); } catch (_) { } }
    renderTask = page.render({ canvasContext: offCtx, viewport });

    try {
        await renderTask.promise;
    } catch (err) {
        if (err && err.name === 'RenderingCancelledException') return true;
        throw err;
    } finally {
        renderTask = null;
        page.cleanup();
    }

    if (gen !== state.generation) return true;

    dom.canvas.width = off.width;
    dom.canvas.height = off.height;
    dom.canvas.style.width = Math.floor(base.width * cssScale) + 'px';
    dom.canvas.style.height = Math.floor(base.height * cssScale) + 'px';
    ctx.drawImage(off, 0, 0);

    showScene('pdf');
    return true;
}

function renderImageSlide(slide, gen) {
    return new Promise(resolve => {
        const probe = new Image();
        probe.onload = () => {
            if (gen !== state.generation) return resolve(true);
            dom.imageViewer.src = probe.src;
            dom.imageViewer.alt = slide.name;
            showScene('image');
            resolve(true);
        };
        probe.onerror = () => {
            console.error('[display3] image illisible :', slide.filename);
            resolve(false);
        };
        probe.src = mediaUrl(slide.filename);
    });
}

async function renderSlide(slide, gen, silent) {
    if (!slide) return;
    if (!silent) setLoading(true);

    let ok = false;
    try {
        ok = slide.type === 'image'
            ? await renderImageSlide(slide, gen)
            : await renderPdfSlide(slide, gen, silent);
    } catch (err) {
        console.error('[display3] rendu impossible :', slide.filename, err);
        ok = false;
    }

    if (gen !== state.generation) return;
    if (!ok) showScene('error');

    setLoading(false);
    updateInfo(slide);
}

function updateInfo(slide) {
    dom.name.textContent = slide.name;
    dom.page.textContent = slide.type === 'image'
        ? 'Image'
        : `Page ${slide.pageNum} / ${slide.totalPages}`;

    const total = state.slides.length;
    const pct = total ? ((state.slideIndex + 1) / total) * 100 : 0;
    dom.progress.style.width = pct.toFixed(2) + '%';
}

/* ------------------------------------------------------------- playlist */

async function buildSlides(gen) {
    const slides = [];
    for (const id of state.selectedIds) {          // ordre = ordre de diffusion
        const item = state.media.find(m => m.id === id);
        if (!item || !item.filename) continue;

        const name = displayName(item);

        if (isImage(item.filename)) {
            slides.push({ type: 'image', filename: item.filename, name, pageNum: 1, totalPages: 1 });
            continue;
        }
        if (!isPdf(item.filename)) continue;

        const doc = await getDoc(item.filename);
        if (gen !== state.generation) return null;
        if (!doc) continue;

        for (let p = 1; p <= doc.numPages; p++) {
            slides.push({ type: 'pdf', filename: item.filename, name, pageNum: p, totalPages: doc.numPages });
        }
    }
    return slides;
}

function scheduleNext(gen) {
    clearTimeout(slideTimer);
    if (state.slides.length <= 1) return;          // un seul média : pas de rotation
    slideTimer = setTimeout(() => {
        if (gen !== state.generation) return;
        state.slideIndex = (state.slideIndex + 1) % state.slides.length;
        writePosition();
        showCurrent(gen);
    }, state.slideMs);
}

async function showCurrent(gen) {
    const slide = state.slides[state.slideIndex];
    if (!slide) { showScene('none'); return; }
    await renderSlide(slide, gen, false);
    if (gen !== state.generation) return;
    scheduleNext(gen);
}

async function rebuildPlaylist() {
    const gen = ++state.generation;
    clearTimeout(slideTimer);
    if (renderTask) { try { renderTask.cancel(); } catch (_) { } renderTask = null; }

    if (!state.selectedIds.length) {
        showScene('none');
        dom.progress.style.width = '0%';
        await pruneDocCache(new Set());
        return;
    }

    setLoading(true);
    const slides = await buildSlides(gen);
    if (gen !== state.generation) return;

    state.slides = slides || [];
    state.signature = state.selectedIds.join(',') + '#' + state.slides.length;

    // reprise du carrousel là où le cycle précédent s'était arrêté
    const resumed = readPosition(state.signature);
    state.slideIndex = state.slides.length ? Math.min(resumed, state.slides.length - 1) : 0;
    state.slideMs = Math.max(state.mediaSeconds * 1000, CONFIG.MIN_SLIDE_MS);

    await pruneDocCache(new Set(state.slides.map(s => s.filename)));
    if (gen !== state.generation) return;

    if (!state.slides.length) {
        setLoading(false);
        showScene('none');
        dom.progress.style.width = '0%';
        return;
    }

    writePosition();
    await showCurrent(gen);
}

/* ------------------------------------------- rotation entre les pages 1/2/3 */

function goToPage(page) {
    window.location.href = page === 1 ? '/display1' : '/display2';
}

function startFooterCountdown(durationMs) {
    clearInterval(footerTimer);
    if (!dom.footerFill) return;
    const start = Date.now();
    dom.footerFill.style.width = '0%';
    footerTimer = setInterval(() => {
        const pct = Math.min(100, ((Date.now() - start) / durationMs) * 100);
        dom.footerFill.style.width = pct.toFixed(2) + '%';
        if (pct >= 100) clearInterval(footerTimer);
    }, 250);
}

function applyDisplaySettings(display) {
    if (!display) return;
    const key = JSON.stringify(display);
    if (key === state.lastDisplayHash) return;
    state.lastDisplayHash = key;

    const pages = Array.isArray(display.pages) && display.pages.length ? display.pages : [1, 2];
    const duree = Number(display.duree3);
    state.page3Duration = duree > 0 ? duree : 30;

    const perMedia = Number(display.duree_media);
    state.mediaSeconds = perMedia > 0 ? perMedia : CONFIG.DEFAULT_MEDIA_SECONDS;
    state.slideMs = Math.max(state.mediaSeconds * 1000, CONFIG.MIN_SLIDE_MS);

    if (!pages.includes(3)) {
        goToPage(pages.includes(1) ? 1 : 2);
        return;
    }

    clearTimeout(switchTimer);
    clearInterval(footerTimer);

    if (pages.length > 1) {
        const next = pages[(pages.indexOf(3) + 1) % pages.length];
        const ms = state.page3Duration * 1000;
        startFooterCountdown(ms);
        switchTimer = setTimeout(() => {
            writePosition();       // on quitte : la reprise repartira d'ici
            goToPage(next);
        }, ms);
    } else if (dom.footerFill) {
        dom.footerFill.style.width = '100%';
    }
}

/* ------------------------------------------------------------ données */

async function refreshData() {
    let data;
    try {
        const res = await fetch(CONFIG.API_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();
    } catch (err) {
        console.error('[display3] /api/data injoignable', err);
        return;
    }

    updateAnnonce(data.annonce);
    applyDisplaySettings(data.display);

    const hash = JSON.stringify(data.pdfs) + '|' + JSON.stringify(data.selected_pdfs);
    if (hash === state.lastPlaylistHash) return;
    state.lastPlaylistHash = hash;

    state.media = data.pdfs || [];
    state.selectedIds = data.selected_pdfs || [];
    await rebuildPlaylist();
}

/* -------------------------------------------------- horloge / annonces */

function updateClock() {
    const now = new Date();
    if (dom.clock) {
        dom.clock.textContent =
            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
}

function updateDate() {
    const now = new Date();
    if (dom.date) {
        dom.date.textContent = now
            .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
            .toUpperCase();
    }
}

function updateAnnonce(annonce) {
    const text = annonce || '';
    if (text === state.lastAnnonce) return;
    state.lastAnnonce = text;
    if (dom.annonce1) dom.annonce1.textContent = text;
    if (dom.annonce2) dom.annonce2.textContent = text;
    const duration = Math.max(15, text.length * 0.15);
    document.documentElement.style.setProperty('--marquee-duration', `${duration}s`);
}

/* ------------------------------------------------------ redimensionnement */

function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const slide = state.slides[state.slideIndex];
        if (slide && slide.type === 'pdf') renderSlide(slide, state.generation, true);
    }, CONFIG.RESIZE_DEBOUNCE_MS);
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
if (window.ResizeObserver) new ResizeObserver(handleResize).observe(dom.container);

window.addEventListener('beforeunload', () => {
    writePosition();
    clearTimeout(slideTimer);
    clearTimeout(switchTimer);
    clearInterval(footerTimer);
    state.generation++;
    pruneDocCache(new Set());
});

/* --------------------------------------------------------------- démarrage */

updateClock();
updateDate();
setInterval(updateClock, 1000);
setInterval(updateDate, 60000);

setInterval(refreshData, CONFIG.REFRESH_MS);
refreshData();