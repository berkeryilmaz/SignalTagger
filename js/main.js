/**
 * Ana Giriş Noktası (Main Entry Point)
 * ======================================
 *
 * Bu dosya sadece başlatma (initialization) mantığını içerir.
 * Tüm iş mantığı ilgili modüllere taşınmıştır:
 *
 *   Core:     state.js, constants.js, math_utils.js, utils.js, events.js, signal_ops.js, class_manager.js
 *   Analysis: peaks.js, physics.js, statistics.js, region_detector.js, filters.js, histogram.js
 *   UI:       ui.js, charts.js, navigation.js, class_ui.js, analysis_ui.js, playback.js,
 *             interactions.js, scope_screen.js, distributions_ui.js, oscilloscope_config_ui.js
 *   IO:       loader.js, bin_loader.js, export.js
 */

console.log("Initializing Signal Analyzer (Modular Refactor v2)...");

// ─── Event Listener'ları Başlat ─────────────────────────────────
if (window.setupEventListeners) {
    window.setupEventListeners();
} else {
    console.error("events.js not loaded!");
}

// ─── UI Hazırlığı ───────────────────────────────────────────────
if (window.renderClassButtons) renderClassButtons();
if (window.setCallbacks && window.jumpToPeak && window.draw) {
    setCallbacks(jumpToPeak, draw);
}

// ─── Chart Etkileşimleri (Zoom/Pan) ─────────────────────────────
if (elements.chartContainer && window.setupChartInteractions) {
    setupChartInteractions(elements.chartContainer);
}

// ─── Fonksiyonlar ───────────────────────────────────────────────

function jumpToPeak(start, end) {
    let center = Math.floor((start + end) / 2);
    let newStart = center - Math.floor(state.windowSize / 2);
    if (newStart < 0) newStart = 0;
    if (state.signal && newStart > state.signal.length - state.windowSize)
        newStart = state.signal.length - state.windowSize;

    state.windowStart = newStart;
    updateSliderMax();
    draw();
}

function updatePhysics() {
    state.physics.R = parseFloat(document.getElementById('physR').value) || 50;
    state.physics.R_unit = document.getElementById('physRUnit').value;
    state.physics.dt = parseFloat(document.getElementById('physDt').value) || 200;
    state.physics.dt_unit = document.getElementById('physDtUnit').value;

    if (window.analysisData && window.analysisData.length > 0) {
        if (window.updatePeakAnalysis) window.updatePeakAnalysis();
    }
}

function setBaselineCallback(val) {
    updateState({ baselineValue: roundToPrecision(val) });
    elements.baselineInput.value = state.baselineValue;
    if (state.signal) draw();
}

// ─── SG Wizard ──────────────────────────────────────────────────

function runSGWizard() {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    const resultsDiv = elements.wizardResults;
    resultsDiv.innerHTML = '<div class="wizard-loading-msg">Calculating...</div>';

    let minW = parseInt(document.getElementById("wizMinW").value) || 5;
    let maxW = parseInt(document.getElementById("wizMaxW").value) || 51;
    let minO = parseInt(document.getElementById("wizMinO").value) || 2;
    let maxO = parseInt(document.getElementById("wizMaxO").value) || 3;

    let scope = document.querySelector('input[name="wizScope"]:checked').value;

    let testData;
    if (scope === 'window') {
        let end = Math.min(state.windowStart + state.windowSize, state.signal.length);
        testData = state.signal.slice(state.windowStart, end);
    } else {
        testData = state.signal;
    }

    setTimeout(() => {
        let results = [];
        for (let w = minW; w <= maxW; w += 2) {
            for (let o = minO; o <= maxO; o++) {
                if (o >= w) continue;
                let smoothed = window.applySavitzkyGolay(testData, w, o);
                let r2 = window.calculateR2(testData, smoothed);
                results.push({ w, o, r2 });
            }
        }

        results.sort((a, b) => b.r2 - a.r2);

        resultsDiv.innerHTML = '';
        if (results.length === 0) { resultsDiv.innerHTML = 'No valid combinations.'; return; }

        results.forEach((res, index) => {
            let row = document.createElement('div');
            row.className = `result-row ${index === 0 ? 'best-fit' : ''}`;
            row.innerHTML = `<span>N=${res.w}</span><span>P=${res.o}</span><span>${res.r2.toFixed(5)}</span>`;
            row.onclick = () => {
                applyWizardSettings(res.w, res.o);
                document.querySelectorAll('.result-row').forEach(r => r.classList.remove('best-fit'));
                row.classList.add('best-fit');
            };
            resultsDiv.appendChild(row);
        });

        if (results.length > 0) applyWizardSettings(results[0].w, results[0].o);
    }, 50);
}

function applyWizardSettings(w, o) {
    elements.sgWindowInput.value = w;
    elements.sgOrderInput.value = o;
    if (!state.isSmoothEnabled) {
        toggleSmooth();
    } else {
        recalcFilters();
    }
}

// ─── Baseline Kontrolleri ───────────────────────────────────────
if (elements.baselineToggle) {
    elements.baselineToggle.addEventListener("change", (e) => {
        updateState({ isBaselineEnabled: e.target.checked });
        if (elements.baselineInput) elements.baselineInput.disabled = !state.isBaselineEnabled;
        draw(false);
    });
}

if (elements.baselineInput) {
    elements.baselineInput.addEventListener("change", (e) => {
        updateState({ baselineValue: parseFloat(e.target.value) || 0 });
        draw(false);
    });
}

// ─── Global Exposure ────────────────────────────────────────────
window.jumpToPeak = jumpToPeak;
window.runSGWizard = runSGWizard;
window.updatePhysics = updatePhysics;
window.setBaselineCallback = setBaselineCallback;
window.updateHistoChart = () => runHistogramAnalysis(false);
