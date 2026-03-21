// UI: Interactions — Zoom, Pan, Mark & Keyboard
// Kullanıcı etkileşim mantığını (mouse/keyboard) yönetir.

/**
 * Seçili bölgeye etiket uygular (chart selection callback).
 */
function markRange(start, end) {
    if (!state.signal) return;

    start = Math.max(0, start);
    end = Math.min(state.signal.length - 1, end);

    const type = state.currentLabelType;
    for (let i = start; i <= end; i++) {
        state.labels[i] = type;
    }

    draw(true);
    if (window.updatePeakAnalysis) window.updatePeakAnalysis();
}

/**
 * Zoom ve Pan event listener'larını başlatır.
 * @param {HTMLElement} chartContainer - chart-container elementi
 */
function setupChartInteractions(chartContainer) {
    if (!chartContainer) return;

    // ─── Alt + Scroll ile Zoom ──────────────────────────────────
    chartContainer.addEventListener("wheel", function (e) {
        if (!e.altKey || !state.signal || state.signal.length === 0) return;
        e.preventDefault();

        const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
        let newWindowSize = Math.max(50, Math.min(state.signal.length, Math.round(state.windowSize * zoomFactor)));

        const rect = chartContainer.getBoundingClientRect();
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

    // ─── Orta Fare Tuşu ile Pan ─────────────────────────────────
    let isPanning = false, startPanX = 0, startPanWindowStart = 0;

    chartContainer.addEventListener("mousedown", (e) => {
        if (e.button === 1 && state.signal && state.signal.length > 0) {
            e.preventDefault();
            isPanning = true;
            startPanX = e.clientX;
            startPanWindowStart = state.windowStart;
            chartContainer.style.cursor = "grabbing";
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isPanning) return;
        e.preventDefault();
        const rect = chartContainer.getBoundingClientRect();
        const deltaSamples = Math.round((startPanX - e.clientX) * (state.windowSize / rect.width));
        let newStart = Math.max(0, Math.min(state.signal.length - state.windowSize, startPanWindowStart + deltaSamples));

        if (newStart !== state.windowStart) {
            updateState({ windowStart: newStart });
            if (elements.offsetInput) elements.offsetInput.value = newStart;
            draw(true);
        }
    });

    window.addEventListener("mouseup", (e) => {
        if (isPanning) {
            isPanning = false;
            chartContainer.style.cursor = "";
        }
    });
}

// Global exposure
window.markRange = markRange;
window.setupChartInteractions = setupChartInteractions;
