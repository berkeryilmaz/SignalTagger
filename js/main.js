// Main Entry Point

console.log("Initializing Signal Analyzer (Modular Refactor)...");

// Initialize Events
if (window.setupEventListeners) {
    window.setupEventListeners();
} else {
    console.error("events.js not loaded!");
}

// Initial UI Setup
if (window.renderClassButtons) renderClassButtons();
if (window.setCallbacks && window.jumpToPeak && window.draw) {
    setCallbacks(jumpToPeak, draw);
}

// --- Implementation ---

// Navigation functions moved to ui/navigation.js

// functions moved to core/signal_ops.js

// alignBaselineToZero moved to core/signal_ops.js


// Playback
function togglePlay() {
    state.isPlaying = !state.isPlaying;
    const playIcon = document.getElementById("playIcon");
    const pauseIcon = document.getElementById("pauseIcon");

    if (state.isPlaying) {
        if (playIcon) playIcon.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "inline";

        if (state.playInterval) clearInterval(state.playInterval);

        const updateInterval = () => {
            if (state.playInterval) clearInterval(state.playInterval);
            let fps = parseInt(document.getElementById("speedInput").value) || 20;
            if (fps <= 0) fps = 1;
            let intervalMs = 1000 / fps;

            state.playInterval = setInterval(() => {
                if (!state.signal) { togglePlay(); return; }
                let step = state.stride || state.windowSize;
                let next = state.windowStart + step;
                if (next > state.signal.length - state.windowSize) {
                    togglePlay(); // Stop at end, or loop? User didn't specify. Standard is stop or loop. Let's loop as before.
                    next = 0;
                }
                state.windowStart = next;
                updateSliderMax();
                draw(true);
            }, intervalMs);
        };

        updateInterval();

        // Listen for FPS changes while playing
        document.getElementById("speedInput").onchange = () => {
            if (state.isPlaying) updateInterval();
        };

    } else {
        if (playIcon) playIcon.style.display = "inline";
        if (pauseIcon) pauseIcon.style.display = "none";
        clearInterval(state.playInterval);
        document.getElementById("speedInput").onchange = null; // Clean up listener
    }
}

// Class Management moved to ui/class_ui.js

function openClassManager() {
    openModal('classManagerModal');
    const container = document.getElementById("classListContainer");
    if (!container) return;
    container.innerHTML = "";
    Object.keys(state.labelTypes).forEach(key => {
        if (key === "0" || key === "5") return;
        let t = state.labelTypes[key];
        let d = document.createElement("div");
        d.innerHTML = `<div style="display:flex; gap:10px; margin-bottom:5px;">
            <input type="color" value="${t.color}" disabled style="border:none; background:none;">
            <span>${t.name} (ID: ${key})</span>
        </div>`;
        container.appendChild(d);
    });
}

function addNewClass() {
    const name = document.getElementById("newClassName").value;
    const color = document.getElementById("newClassColor").value;
    if (!name) return;

    let maxId = 5;
    Object.keys(state.labelTypes).forEach(k => maxId = Math.max(maxId, parseInt(k)));
    let newId = maxId + 1;

    state.labelTypes[newId] = { name: name, color: color };
    renderClassButtons();
    document.getElementById("newClassName").value = "";
    openClassManager();
}

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

// Keyboard Handling
function handleKeydown(e) {
    if (e.key === "Alt") elements.chartContainer.classList.add('zoom-ready');
    if (e.target.tagName === 'INPUT') return;

    if (e.key === "ArrowRight") { e.preventDefault(); nextWindow(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prevWindow(); }
    if (e.key === " ") { e.preventDefault(); togglePlay(); }

    let num = parseInt(e.key);
    if (!isNaN(num) && num !== 0) {
        if (state.labelTypes[num]) setLabelType(num);
    }
    else if (e.key === "0") setLabelType(0);
}

function handleKeyup(e) {
    if (e.key === "Alt") elements.chartContainer.classList.remove('zoom-ready');
}

// Wizard
function runSGWizard() {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    const resultsDiv = elements.wizardResults;
    resultsDiv.innerHTML = '<div class="wizard-loading-msg">Calculating...</div>';

    let minW = parseInt(document.getElementById("wizMinW").value) || 5;
    let maxW = parseInt(document.getElementById("wizMaxW").value) || 51;
    let minO = parseInt(document.getElementById("wizMinO").value) || 2;
    let maxO = parseInt(document.getElementById("wizMaxO").value) || 4;

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

                // Use global helper now
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

function updateSingleDistChart(type) {
    if (analysisData.length === 0) return;

    let data, containerId, title, xTitle, color, binInputId;

    if (type === 'width') {
        data = analysisData.map(d => d.width);
        containerId = 'distChartWidth'; title = 'Width Distribution'; xTitle = 'Samples'; color = '#00e676'; binInputId = 'binsWidth';
    } else if (type === 'voltage') {
        data = analysisData.map(d => d.maxVal);
        containerId = 'distChartVoltage'; title = 'Max Voltage Distribution'; xTitle = 'Volts'; color = '#e03f6f'; binInputId = 'binsVoltage';
    } else if (type === 'area') {
        data = analysisData.map(d => d.area);
        containerId = 'distChartArea'; title = 'Area Distribution'; xTitle = 'V·s'; color = '#ff9800'; binInputId = 'binsArea';
    }

    let binCount = parseInt(document.getElementById(binInputId).value) || 20;
    // Call global helper from histogram.js
    if (window.createDistributionChart) window.createDistributionChart(containerId, data, title, xTitle, color, binCount);
}

function setBaselineCallback(val) {
    // Helper for histogram module to call back into main
    updateState({ baselineValue: roundToPrecision(val) });
    elements.baselineInput.value = state.baselineValue;
    if (state.signal) draw();
}

// Expose globals for HTML
window.handleSliderInput = handleSliderInput;
window.prevWindow = prevWindow;
window.nextWindow = nextWindow;
window.updatePrecision = updatePrecision;
window.invertSignal = invertSignal;
window.alignBaselineToZero = alignBaselineToZero;

// --- Mouse Interaction (Zoom & Pan) ---

if (elements.chartContainer) {
    // Zoom with Alt + Scroll
    elements.chartContainer.addEventListener("wheel", function (e) {
        if (!e.altKey || !state.signal || state.signal.length === 0) return;
        e.preventDefault();

        const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
        let newWindowSize = Math.max(50, Math.min(state.signal.length, Math.round(state.windowSize * zoomFactor)));

        const rect = elements.chartContainer.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        let newWindowStart = Math.round((state.windowStart + ratio * state.windowSize) - (ratio * newWindowSize));

        if (newWindowStart < 0) newWindowStart = 0;
        if (newWindowStart > state.signal.length - newWindowSize) newWindowStart = state.signal.length - newWindowSize;

        updateState({ windowSize: newWindowSize, windowStart: newWindowStart });

        if (state.isSizeStrideLocked) {
            updateState({ stride: newWindowSize });
            if (elements.strideInput) elements.strideInput.value = newWindowSize;
        }
        if (elements.windowSizeInput) elements.windowSizeInput.value = newWindowSize;
        if (elements.offsetInput) elements.offsetInput.value = newWindowStart;

        updateSliderMax();
        draw(true);
    }, { passive: false });

    // Pan with Middle Mouse Button
    let isPanning = false, startPanX = 0, startPanWindowStart = 0;

    elements.chartContainer.addEventListener("mousedown", (e) => {
        if (e.button === 1 && state.signal && state.signal.length > 0) {
            e.preventDefault();
            isPanning = true;
            startPanX = e.clientX;
            startPanWindowStart = state.windowStart;
            elements.chartContainer.style.cursor = "grabbing";
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isPanning) return;
        e.preventDefault();
        const rect = elements.chartContainer.getBoundingClientRect();
        const deltaSamples = Math.round((startPanX - e.clientX) * (state.windowSize / rect.width));
        let newStart = Math.max(0, Math.min(state.signal.length - state.windowSize, startPanWindowStart + deltaSamples));

        if (newStart !== state.windowStart) {
            updateState({ windowStart: newStart });
            if (elements.offsetInput) elements.offsetInput.value = newStart;
            draw(true);
        }
    });

    window.addEventListener("mouseup", (e) => {
        if (isPanning) { // Any button release stops pan effectively or check button 1
            isPanning = false;
            elements.chartContainer.style.cursor = "";
        }
    });
}

window.togglePlay = togglePlay;
// renderClassButtons, setLabelType, openClassManager, addNewClass are now in js/ui/class_ui.js
window.jumpToPeak = jumpToPeak;
window.runSGWizard = runSGWizard;
window.updateSingleDistChart = updateSingleDistChart;
window.setBaselineCallback = setBaselineCallback;
window.updateHistoChart = () => runHistogramAnalysis(false);

function markRange(start, end) {
    if (!state.signal) return;

    // Constrain
    start = Math.max(0, start);
    end = Math.min(state.signal.length - 1, end);

    // Apply label
    // If current type is 0 (None), this effectively erases labels
    const type = state.currentLabelType;

    for (let i = start; i <= end; i++) {
        state.labels[i] = type;
    }

    draw(true);
    if (window.updatePeakAnalysis) window.updatePeakAnalysis();
}
// Lock/Unlock Logic
function toggleLock() {
    updateState({ isSizeStrideLocked: !state.isSizeStrideLocked });

    document.getElementById("iconUnlocked").classList.toggle("hidden", state.isSizeStrideLocked);
    document.getElementById("iconLocked").classList.toggle("hidden", !!state.isSizeStrideLocked === false); // force boolean

    if (state.isSizeStrideLocked) {
        // Sync Stride to Size
        updateState({ stride: state.windowSize });
        if (elements.strideInput) elements.strideInput.value = state.windowSize;
    }
}
window.toggleLock = toggleLock;

// Baseline Controls (Added here as they were missing in main logic)
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
