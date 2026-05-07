function buildOptions() {
    return '<option value="" disabled>Choisir…</option>' +
        COLLABORATEURS.map(c => `<option value="${c}">${c}</option>`).join('');
}
function addRow(containerId) {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.className = 'equipe-row';
    row.innerHTML = `
        <select name="equipe">${buildOptions()}</select>
        <button type="button" class="btn-remove-person" onclick="removeRow(this)">−</button>`;
    container.appendChild(row);
}
function removeRow(btn) {
    btn.closest('.equipe-row').remove();
}

function updateSliderLabel(val, labelId) {
    const label = document.getElementById(labelId || 'slider-label');
    if (!label) return;
    if (val >= 60) {
        const m = Math.floor(val / 60);
        const s = val % 60;
        label.textContent = s > 0 ? `${m}m${s}s` : `${m}min`;
    } else {
        label.textContent = val + 's';
    }
}
const slider1 = document.getElementById('slider-duree1');
if (slider1) updateSliderLabel(slider1.value, 'slider-label1');
const slider2 = document.getElementById('slider-duree2');
if (slider2) updateSliderLabel(slider2.value, 'slider-label2');
const slider3 = document.getElementById('slider-duree3');
if (slider3) updateSliderLabel(slider3.value, 'slider-label3');

function checkAtLeastOne(changed, otherId1, otherId2) {
    const other1 = document.getElementById(otherId1);
    const other2 = document.getElementById(otherId2);
    const anyChecked = (other1 && other1.checked) || (other2 && other2.checked);
    if (!changed.checked && !anyChecked) {
        changed.checked = true;
    }
}

function switchTab(n) {
    document.getElementById('panel1').classList.toggle('hidden', n !== 1);
    document.getElementById('panel2').classList.toggle('hidden', n !== 2);
    document.getElementById('panel3').classList.toggle('hidden', n !== 3);
    document.getElementById('tab1').classList.toggle('active', n === 1);
    document.getElementById('tab2').classList.toggle('active', n === 2);
    document.getElementById('tab3').classList.toggle('active', n === 3);
}
if (window.location.hash === '#page2') switchTab(2);
if (window.location.hash === '#page3') switchTab(3);

function toggleTask(id) {
    const body = document.getElementById('body-' + id);
    const arrow = document.getElementById('arrow-' + id);
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    arrow.classList.toggle('open', !isOpen);
}

const dtInput = document.getElementById('datetime-input');
if (dtInput) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    dtInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}