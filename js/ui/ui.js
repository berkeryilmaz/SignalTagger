// UI Elements & Helpers

const elements = {
    fileInput: document.getElementById("fileInput"),
    loadingEl: document.getElementById("loading"),
    loadingText: document.getElementById("loadingText"),
    loadingProgress: document.getElementById("loadingProgress"),
    offsetInput: document.getElementById("offsetInput"),
    timeSlider: document.getElementById("timeSlider"),
    statusTool: document.getElementById("active-tool-status"),
    snapCheckbox: document.getElementById("snapCheckbox"),
    classContainer: document.getElementById("dynamicClassButtons"),
    chartContainer: document.getElementById("chart-container"),
    windowSizeInput: document.getElementById("windowSizeInput"),
    strideInput: document.getElementById("strideInput"),
    lockBtn: document.getElementById("lockSizeStrideBtn"),
    iconUnlocked: document.getElementById("iconUnlocked"),
    iconLocked: document.getElementById("iconLocked"),
    derivToggleBtn: document.getElementById("derivToggleBtn"),
    sgToggleBtn: document.getElementById("sgToggleBtn"),
    sgSettingsPanel: document.getElementById("sgSettingsPanel"),
    sgWindowInput: document.getElementById("sgWindowInput"),
    sgOrderInput: document.getElementById("sgOrderInput"),
    baselineToggle: document.getElementById("baselineToggle"),
    baselineInput: document.getElementById("baselineInput"),
    analysisPanel: document.getElementById("analysis-panel"),
    precisionInput: document.getElementById("precisionInput"),

    // Icons
    iconSun: document.getElementById("iconSun"),
    iconMoon: document.getElementById("iconMoon"),

    // Wizard
    wizardResults: document.getElementById("wizardResults")
};

// --- Loading State ---
function showLoading(msg, subtext = "") {
    if (elements.loadingEl) {
        elements.loadingEl.style.display = "flex";
        if (elements.loadingText) elements.loadingText.textContent = msg + (subtext ? ` (${subtext})` : "");
        updateProgressBar(0);
    }
}

function updateProgressBar(percent) {
    if (elements.loadingProgress) elements.loadingProgress.style.width = percent + "%";
}

function hideLoading() {
    if (elements.loadingEl) elements.loadingEl.style.display = "none";
}

// --- Modals ---
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    let btns = document.querySelectorAll('.tab-btn');
    if (tabId === 'tab-threshold') {
        if (btns[0]) btns[0].classList.add('active');
    } else {
        if (btns[1]) btns[1].classList.add('active');
    }

    const msg = document.getElementById("peakResultMsg");
    if (msg) msg.textContent = "";
}

// --- Theme ---
function toggleTheme() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (isLight) {
        document.body.removeAttribute('data-theme');
        elements.iconSun.style.display = 'none';
        elements.iconMoon.style.display = 'block';
    } else {
        document.body.setAttribute('data-theme', 'light');
        elements.iconSun.style.display = 'block';
        elements.iconMoon.style.display = 'none';
    }
    // Redraw charts to update colors
    if (typeof draw === 'function') draw(true);
}

// --- Lock Window/Stride ---
function toggleLock() {
    state.isSizeStrideLocked = !state.isSizeStrideLocked;
    if (state.isSizeStrideLocked) {
        elements.lockBtn.classList.add("active");
        elements.iconUnlocked.style.display = "none";
        elements.iconLocked.style.display = "block";
        elements.strideInput.value = elements.windowSizeInput.value;
        state.stride = parseInt(elements.windowSizeInput.value);
    } else {
        elements.lockBtn.classList.remove("active");
        elements.iconUnlocked.style.display = "block";
        elements.iconLocked.style.display = "none";
    }
}

window.elements = elements;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.updateProgressBar = updateProgressBar;
window.openModal = openModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
// Analysis Panel
function toggleAnalysisPanel() {
    const p = elements.analysisPanel; // analysis-panel in HTML
    if (!p) return;
    p.classList.toggle("collapsed");
    document.querySelector(".analysis-header span:last-child").textContent = p.classList.contains("collapsed") ? "▼" : "▲";
}

window.toggleAnalysisPanel = toggleAnalysisPanel;
window.toggleLock = toggleLock;

// UI Scaling
function updateUIScale(val) {
    document.documentElement.style.setProperty('--ui-zoom', val);
    const label = document.getElementById("uiScaleValue");
    if (label) label.textContent = val + "x";
    localStorage.setItem("uiScale", val);
}

// Load saved scale
const savedScale = localStorage.getItem("uiScale");
if (savedScale) {
    updateUIScale(savedScale);
    // Update input if exists (might run before DOM load, handled in main init if needed, but inline script works for CSS)
    document.addEventListener("DOMContentLoaded", () => {
        const input = document.getElementById("uiScaleInput");
        if (input) input.value = savedScale;
    });
}

window.updateUIScale = updateUIScale;
