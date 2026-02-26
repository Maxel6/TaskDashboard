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

function updateSliderLabel(val) {
    const label = document.getElementById('slider-label');
    if (!label) return;
    if (val >= 60) {
        const m = Math.floor(val / 60);
        const s = val % 60;
        label.textContent = s > 0 ? `${m}m${s}s` : `${m}min`;
    } else {
        label.textContent = val + 's';
    }
}

const slider = document.getElementById('slider-duree');
if (slider) updateSliderLabel(slider.value);

function checkAtLeastOne(changed, otherId) {
    const other = document.getElementById(otherId);
    if (!changed.checked && other && !other.checked) {
        changed.checked = true;
    }
}
function toggleTask(id) {
    const body = document.getElementById('body-' + id);
    const arrow = document.getElementById('arrow-' + id);
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    arrow.classList.toggle('open', !isOpen);
}