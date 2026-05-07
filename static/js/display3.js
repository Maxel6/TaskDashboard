pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ==========================================
// CONFIGURATION - Modifier ces valeurs ici
// ==========================================

// Durée par PDF quand il n'y a PAS d'autres pages (tâches/moteurs) - en millisecondes
// Par défaut: 1 minute = 60000ms
const DEFAULT_TIME_PER_PDF_MS = 60000;

// ==========================================

let pdfs = [], selectedPdfIds = [], currentPdfIndex = 0, rotationTimer = null, timePerPageMs = 5000;
let lastPdfsHash = null, currentPdfDoc = null, currentPageNum = 1, currentPdfTotalPages = 1;
let lastDisplayHash = null, switchTimer = null, pages_active = [1, 2, 3], page3Duration = 30;
let hasOtherPages = false; // true si tâches ou moteurs sont actifs

const canvas = document.getElementById('pdf-canvas'), ctx = canvas.getContext('2d');
const wrapper = document.getElementById('pdf-wrapper'), noPdf = document.getElementById('no-pdf');
const loader = document.getElementById('loader');
const pdfInfo = document.getElementById('pdf-info');
const pdfName = document.getElementById('pdf-name');
const pdfPage = document.getElementById('pdf-page');
const pdfProgress = document.getElementById('pdf-progress');

function calculateAspectRatioFitScale(pageWidth, pageHeight, viewportWidth, viewportHeight, devicePixelRatio) {
    return Math.min(viewportWidth / pageWidth, viewportHeight / pageHeight) * devicePixelRatio;
}

function setLoading(loading) {
    if (loading) {
        loader.classList.add('visible');
    } else {
        loader.classList.remove('visible');
    }
}

function updatePdfInfo(name, page, total) {
    pdfName.textContent = name || '-';
    pdfPage.textContent = `Page ${page} / ${total}`;
    // Barre de progression active seulement si d'autres pages existent (tâches/moteurs)
    if (hasOtherPages) {
        const progress = total > 0 ? (page / total) * 100 : 0;
        pdfProgress.style.width = `${progress}%`;
    } else {
        // Sinon, barre pleine (pas de progression temporelle)
        pdfProgress.style.width = '100%';
    }
}

// Vérifie s'il n'y a qu'un seul PDF avec une seule page (pas de rotation nécessaire)
function isSingleStaticPdf() {
    return selectedPdfIds.length === 1 && currentPdfTotalPages === 1;
}

async function renderPdfPage(pdfDoc, pageNum, pdfNameText = '') {
    try {
        const skipTransition = isSingleStaticPdf();

        if (!skipTransition) {
            setLoading(true);
            // Fade out canvas before rendering
            canvas.classList.add('fade-out');
            await new Promise(r => setTimeout(r, 150));
        }

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const dpr = window.devicePixelRatio || 1;
        const scale = calculateAspectRatioFitScale(viewport.width, viewport.height, window.innerWidth, window.innerHeight, dpr);
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${viewport.width * (scale / dpr)}px`;
        canvas.style.height = `${viewport.height * (scale / dpr)}px`;

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        if (!skipTransition) {
            // Fade in canvas after rendering
            canvas.classList.remove('fade-out');
            setLoading(false);
        }

        updatePdfInfo(pdfNameText, pageNum, currentPdfTotalPages);
    } catch (error) {
        console.error('Error rendering PDF:', error);
        if (!isSingleStaticPdf()) setLoading(false);
    }
}

function getDisplayName(filename) {
    return filename.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').trim();
}

async function loadPdfDoc(filename) {
    const wasEmpty = !currentPdfDoc;
    if (!wasEmpty) setLoading(true);

    if (currentPdfDoc) currentPdfDoc.destroy();
    currentPdfDoc = await pdfjsLib.getDocument({ url: `/uploads/pdfs/${filename}` }).promise;
    currentPdfTotalPages = currentPdfDoc.numPages;
    currentPageNum = 1;

    // Si c'est le premier chargement et qu'il n'y a qu'un seul PDF avec une page, pas de loader
    const skipLoader = wasEmpty && isSingleStaticPdf();

    await renderPdfPage(currentPdfDoc, currentPageNum, getDisplayName(filename));
    if (!skipLoader) setLoading(false);
}

function showNoPdf() {
    wrapper.classList.remove('visible');
    setTimeout(() => wrapper.classList.add('hidden'), 400);
    noPdf.classList.remove('hidden');
    pdfInfo.classList.remove('visible');
    pdfProgress.style.width = '0%';
}

function showPdfContainer() {
    wrapper.classList.remove('hidden');
    noPdf.classList.add('hidden');
    setTimeout(() => wrapper.classList.add('visible'), 50);
    pdfInfo.classList.add('visible');
}

async function advanceSlide() {
    if (!currentPdfDoc || selectedPdfIds.length === 0) return;

    const currentPdf = pdfs.find(p => p.id === selectedPdfIds[currentPdfIndex]);

    // If there are more pages in current PDF, advance page
    if (currentPageNum < currentPdfTotalPages) {
        currentPageNum++;
        await renderPdfPage(currentPdfDoc, currentPageNum, currentPdf ? getDisplayName(currentPdf.filename) : '');
    } else {
        // Move to next PDF
        currentPdfIndex = (currentPdfIndex + 1) % selectedPdfIds.length;
        const pdfId = selectedPdfIds[currentPdfIndex];
        const pdf = pdfs.find(p => p.id === pdfId);
        if (pdf) {
            await loadPdfDoc(pdf.filename);
        }
    }
}

async function startPresentation() {
    if (rotationTimer) clearInterval(rotationTimer);
    rotationTimer = null;

    if (selectedPdfIds.length === 0) {
        showNoPdf();
        return;
    }

    showPdfContainer();

    // Load first PDF
    const pdfId = selectedPdfIds[currentPdfIndex];
    const pdf = pdfs.find(p => p.id === pdfId);
    if (pdf) {
        await loadPdfDoc(pdf.filename);

        // Démarrer le timer seulement s'il y a plus d'un PDF ou plus d'une page
        if (!isSingleStaticPdf()) {
            rotationTimer = setInterval(advanceSlide, timePerPageMs);
        }
    } else {
        showNoPdf();
    }
}

function calculateTimePerPage() {
    if (!selectedPdfIds.length) return 5000;

    // Si PAS d'autres pages (tâches/moteurs), utiliser le temps fixe par PDF
    if (!hasOtherPages) {
        // Temps fixe par PDF (DEFAULT_TIME_PER_PDF_MS), divisé par le nombre de pages de ce PDF
        const currentPdf = pdfs.find(p => p.id === selectedPdfIds[currentPdfIndex]);
        if (currentPdf && currentPdfDoc) {
            return Math.max(DEFAULT_TIME_PER_PDF_MS / currentPdfTotalPages, 3000);
        }
        return DEFAULT_TIME_PER_PDF_MS;
    }

    // Si d'autres pages existent, calculer basé sur la durée totale de la page
    return Promise.all(selectedPdfIds.map(async (id) => {
        const pdf = pdfs.find(p => p.id === id);
        if (!pdf) return 1;
        try {
            const doc = await pdfjsLib.getDocument({ url: `/uploads/pdfs/${pdf.filename}` }).promise;
            const count = doc.numPages;
            doc.destroy();
            return count;
        } catch (e) {
            return 1;
        }
    })).then(pageCounts => {
        const totalPages = pageCounts.reduce((a, b) => a + b, 0);
        return Math.max((page3Duration * 1000) / totalPages, 3000);
    });
}

function applyDisplaySettings(display) {
    if (!display) return;
    const displayKey = JSON.stringify(display);
    if (displayKey === lastDisplayHash) return;
    lastDisplayHash = displayKey;

    const newPages = display.pages || [1, 2];
    const newDuree3 = display.duree3 || 30;

    if (newDuree3 !== page3Duration) {
        page3Duration = newDuree3;
    }
    if (!newPages.includes(3)) {
        window.location.href = newPages.includes(1) ? '/display1' : newPages.includes(2) ? '/display2' : '/dashboard';
        return;
    }

    // Détecter si d'autres pages sont actives (1 = tâches, 2 = moteurs)
    hasOtherPages = newPages.includes(1) || newPages.includes(2);

    pages_active = newPages;
    if (switchTimer) clearTimeout(switchTimer);
    if (newPages.length > 1) {
        const nextPage = newPages[(newPages.indexOf(3) + 1) % newPages.length];
        switchTimer = setTimeout(() => window.location.href = nextPage === 1 ? '/display1' : nextPage === 2 ? '/display2' : '/display3', page3Duration * 1000);
    }
}

async function updatePdfs(data) {
    const pdfsHash = JSON.stringify(data.pdfs) + JSON.stringify(data.selected_pdfs);
    if (pdfsHash === lastPdfsHash) return;
    lastPdfsHash = pdfsHash;

    pdfs = data.pdfs || [];
    selectedPdfIds = data.selected_pdfs || [];

    // Mettre à jour les annonces
    updateAnnonces(data.annonce);

    applyDisplaySettings(data.display);

    // Recalculate timing based on total pages
    const newTimePerPage = await calculateTimePerPage();
    if (Math.abs(newTimePerPage - timePerPageMs) > 100) {
        timePerPageMs = newTimePerPage;
    }

    currentPdfIndex = 0;
    await startPresentation();
}

async function refreshData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        await updatePdfs(data);
    } catch (e) {
        console.error('Error fetching data:', e);
    }
}

// ==========================================
// HORLOGE ET DATE
// ==========================================

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const clockEl = document.getElementById('clock');
    if (clockEl) clockEl.textContent = `${hours}:${minutes}`;
}

function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const dateStr = now.toLocaleDateString('fr-FR', options);
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.textContent = dateStr.toUpperCase();
}

setInterval(updateClock, 1000);
setInterval(updateDate, 60000);
updateClock();
updateDate();

// ==========================================
// ANNONCES
// ==========================================

let currentAnnonce = '';

function updateAnnonces(annonce) {
    if (annonce === currentAnnonce) return;
    currentAnnonce = annonce || '';

    const annonceText = document.getElementById('annonce-text');
    const annonceText2 = document.getElementById('annonce-text2');

    if (annonceText) annonceText.textContent = currentAnnonce;
    if (annonceText2) annonceText2.textContent = currentAnnonce;

    // Ajuster la vitesse du défilement selon la longueur
    const marqueeDuration = Math.max(15, currentAnnonce.length * 0.15);
    document.documentElement.style.setProperty('--marquee-duration', `${marqueeDuration}s`);
}

// ==========================================
// NETTOYAGE
// ==========================================

window.addEventListener('beforeunload', () => {
    if (rotationTimer) clearInterval(rotationTimer);
    if (switchTimer) clearTimeout(switchTimer);
    if (currentPdfDoc) currentPdfDoc.destroy();
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(async () => {
        if (currentPdfDoc) await renderPdfPage(currentPdfDoc, currentPageNum);
    }, 150);
});

window.addEventListener('orientationchange', () => {
    setTimeout(async () => {
        if (currentPdfDoc) await renderPdfPage(currentPdfDoc, currentPageNum);
    }, 300);
});

setInterval(refreshData, 5000);
refreshData();
