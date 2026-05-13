pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/js/pdfjs/pdf.worker.min.js';

// ==========================================
// CONFIGURATION
// ==========================================
const DEFAULT_TIME_PER_PDF_MS = 60000;

// ==========================================

let pdfs = [], selectedPdfIds = [], currentPdfIndex = 0, rotationTimer = null, timePerPageMs = 5000;
let lastPdfsHash = null, currentPdfDoc = null, currentPageNum = 1, currentPdfTotalPages = 1;
let lastDisplayHash = null, switchTimer = null, pages_active = [1, 2, 3], page3Duration = 30;
let hasOtherPages = false;

const canvas = document.getElementById('pdf-canvas'), ctx = canvas.getContext('2d');
const wrapper = document.getElementById('pdf-wrapper');
const imageWrapper = document.getElementById('image-wrapper'); // Nouveau
const imageViewer = document.getElementById('image-viewer');   // Nouveau
const noPdf = document.getElementById('no-pdf');
const loader = document.getElementById('loader');
const pdfInfo = document.getElementById('pdf-info');
const pdfName = document.getElementById('pdf-name');
const pdfPage = document.getElementById('pdf-page');
const pdfProgress = document.getElementById('pdf-progress');

// Helper pour détecter si c'est une image
function isImage(filename) {
    return /\.(png|jpg|jpeg|webp)$/i.test(filename);
}

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

function updatePdfInfo(name, page, total, isImg = false) {
    pdfName.textContent = name || '-';
    pdfPage.textContent = isImg ? `Image` : `Page ${page} / ${total}`;
    
    if (hasOtherPages) {
        const progress = total > 0 ? (page / total) * 100 : 0;
        pdfProgress.style.width = `${progress}%`;
    } else {
        pdfProgress.style.width = '100%';
    }
}

function isSingleStaticPdf() {
    return selectedPdfIds.length === 1 && currentPdfTotalPages === 1;
}

// Fonction pour afficher une IMAGE
async function renderImage(filename, displayName) {
    setLoading(true);
    
    // Switch visibility
    wrapper.classList.add('hidden');
    imageWrapper.classList.remove('hidden');
    
    imageViewer.src = `/uploads/pdfs/${filename}`;
    
    imageViewer.onload = () => {
        setLoading(false);
        updatePdfInfo(displayName, 1, 1, true);
    };
}

// Fonction pour afficher un PDF
async function renderPdfPage(pdfDoc, pageNum, pdfNameText = '') {
    try {
        const skipTransition = isSingleStaticPdf();

        if (!skipTransition) {
            setLoading(true);
            canvas.classList.add('fade-out');
            await new Promise(r => setTimeout(r, 150));
        }

        // Switch visibility
        imageWrapper.classList.add('hidden');
        wrapper.classList.remove('hidden');

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
            canvas.classList.remove('fade-out');
            setLoading(false);
        }

        updatePdfInfo(pdfNameText, pageNum, currentPdfTotalPages);
    } catch (error) {
        console.error('Error rendering PDF:', error);
        setLoading(false);
    }
}

function getDisplayName(filename) {
    return filename.replace(/\.(pdf|png|jpg|jpeg)$/i, '').replace(/[_-]/g, ' ').replace(/^[a-z0-9]{8}_/i, '').trim();
}

async function loadMedia(filename) {
    const wasEmpty = !currentPdfDoc;
    const displayName = getDisplayName(filename);

    if (isImage(filename)) {
        if (currentPdfDoc) {
            currentPdfDoc.destroy();
            currentPdfDoc = null;
        }
        currentPdfTotalPages = 1;
        currentPageNum = 1;
        await renderImage(filename, displayName);
    } else {
        if (!wasEmpty) setLoading(true);
        if (currentPdfDoc) currentPdfDoc.destroy();
        
        currentPdfDoc = await pdfjsLib.getDocument({ url: `/uploads/pdfs/${filename}` }).promise;
        currentPdfTotalPages = currentPdfDoc.numPages;
        currentPageNum = 1;

        await renderPdfPage(currentPdfDoc, currentPageNum, displayName);
        setLoading(false);
    }
}

function showNoPdf() {
    wrapper.classList.add('hidden');
    imageWrapper.classList.add('hidden');
    noPdf.classList.remove('hidden');
    pdfInfo.classList.remove('visible');
    pdfProgress.style.width = '0%';
}

function showPdfContainer() {
    noPdf.classList.add('hidden');
    pdfInfo.classList.add('visible');
}

async function advanceSlide() {
    if (selectedPdfIds.length === 0) return;

    // Si on est sur un PDF et qu'il reste des pages
    if (currentPdfDoc && currentPageNum < currentPdfTotalPages) {
        currentPageNum++;
        const currentPdf = pdfs.find(p => p.id === selectedPdfIds[currentPdfIndex]);
        await renderPdfPage(currentPdfDoc, currentPageNum, getDisplayName(currentPdf.filename));
    } else {
        // Sinon, on passe au média suivant (Image ou PDF)
        currentPdfIndex = (currentPdfIndex + 1) % selectedPdfIds.length;
        const mediaId = selectedPdfIds[currentPdfIndex];
        const media = pdfs.find(p => p.id === mediaId);
        if (media) {
            await loadMedia(media.filename);
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

    const mediaId = selectedPdfIds[currentPdfIndex];
    const media = pdfs.find(p => p.id === mediaId);
    
    if (media) {
        await loadMedia(media.filename);
        if (selectedPdfIds.length > 1 || currentPdfTotalPages > 1) {
            rotationTimer = setInterval(advanceSlide, timePerPageMs);
        }
    } else {
        showNoPdf();
    }
}

async function calculateTimePerPage() {
    if (!selectedPdfIds.length) return 5000;

    if (!hasOtherPages) {
        return DEFAULT_TIME_PER_PDF_MS; 
    }

    // Calcul complexe pour répartir la durée totale sur toutes les pages de tous les fichiers
    const pageCounts = await Promise.all(selectedPdfIds.map(async (id) => {
        const media = pdfs.find(p => p.id === id);
        if (!media) return 0;
        if (isImage(media.filename)) return 1;
        try {
            const doc = await pdfjsLib.getDocument({ url: `/uploads/pdfs/${media.filename}` }).promise;
            const count = doc.numPages;
            doc.destroy();
            return count;
        } catch (e) { return 1; }
    }));

    const totalPages = pageCounts.reduce((a, b) => a + b, 0);
    return Math.max((page3Duration * 1000) / totalPages, 3000);
}

function applyDisplaySettings(display) {
    if (!display) return;
    const displayKey = JSON.stringify(display);
    if (displayKey === lastDisplayHash) return;
    lastDisplayHash = displayKey;

    const newPages = display.pages || [1, 2];
    const newDuree3 = display.duree3 || 30;

    page3Duration = newDuree3;
    
    if (!newPages.includes(3)) {
        window.location.href = newPages.includes(1) ? '/display1' : '/display2';
        return;
    }

    hasOtherPages = newPages.includes(1) || newPages.includes(2);
    pages_active = newPages;

    if (switchTimer) clearTimeout(switchTimer);
    if (newPages.length > 1) {
        const nextPage = newPages[(newPages.indexOf(3) + 1) % newPages.length];
        switchTimer = setTimeout(() => {
            window.location.href = nextPage === 1 ? '/display1' : '/display2';
        }, page3Duration * 1000);
    }
}

async function updatePdfs(data) {
    const pdfsHash = JSON.stringify(data.pdfs) + JSON.stringify(data.selected_pdfs);
    if (pdfsHash === lastPdfsHash) return;
    lastPdfsHash = pdfsHash;

    pdfs = data.pdfs || [];
    selectedPdfIds = data.selected_pdfs || [];

    updateAnnonces(data.annonce);
    applyDisplaySettings(data.display);

    const newTimePerPage = await calculateTimePerPage();
    timePerPageMs = newTimePerPage;

    currentPdfIndex = 0;
    await startPresentation();
}

async function refreshData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        await updatePdfs(data);
    } catch (e) { console.error('Error fetching data:', e); }
}

// ==========================================
// HORLOGE, DATE, ANNONCES (Inchangés)
// ==========================================
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    if (clockEl) clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
function updateDate() {
    const now = new Date();
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
}
setInterval(updateClock, 1000);
setInterval(updateDate, 60000);
updateClock(); updateDate();

let currentAnnonce = '';
function updateAnnonces(annonce) {
    if (annonce === currentAnnonce) return;
    currentAnnonce = annonce || '';
    const t1 = document.getElementById('annonce-text');
    const t2 = document.getElementById('annonce-text2');
    if (t1) t1.textContent = currentAnnonce;
    if (t2) t2.textContent = currentAnnonce;
    const marqueeDuration = Math.max(15, currentAnnonce.length * 0.15);
    document.documentElement.style.setProperty('--marquee-duration', `${marqueeDuration}s`);
}

// Nettoyage et Resize
window.addEventListener('beforeunload', () => {
    if (rotationTimer) clearInterval(rotationTimer);
    if (switchTimer) clearTimeout(switchTimer);
    if (currentPdfDoc) currentPdfDoc.destroy();
});

window.addEventListener('resize', async () => {
    if (currentPdfDoc) await renderPdfPage(currentPdfDoc, currentPageNum);
});

setInterval(refreshData, 5000);
refreshData();