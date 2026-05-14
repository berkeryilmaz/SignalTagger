// UI: Navigation & Timeline Controls

function handleSliderInput() {
    state.windowStart = parseInt(elements.timeSlider.value);
    if (window.draw) window.draw(true);
}

function prevWindow() {
    let step = state.isSizeStrideLocked ? state.windowSize : (state.stride || state.windowSize);
    state.windowStart = Math.max(0, state.windowStart - step);
    updateSliderMax();
    if (window.draw) window.draw(true);
}

function nextWindow() {
    if (!state.signal) return;
    let step = state.isSizeStrideLocked ? state.windowSize : (state.stride || state.windowSize);
    state.windowStart = Math.min(state.signal.length - state.windowSize, state.windowStart + step);
    updateSliderMax();
    if (window.draw) window.draw(true);
}

function updateSliderMax() {
    if (!state.signal) return;
    let maxStart = Math.max(0, state.signal.length - state.windowSize);
    if (elements.timeSlider) {
        elements.timeSlider.max = maxStart;
        elements.timeSlider.value = state.windowStart;
    }
}

/**
 * Tüm sinyali ekrana sığdırır: windowStart=0, windowSize=signal.length
 */
function rescaleSignalView() {
    if (!state.signal || state.signal.length === 0) return;

    // Y ekseni: tüm sinyal üzerinden min/max voltajı hesapla
    let gMin = Infinity, gMax = -Infinity;
    for (let i = 0; i < state.signal.length; i++) {
        const v = state.signal[i];
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
    }
    const margin = (gMax - gMin) * 0.02 || 0.01;

    updateState({ globalMin: gMin - margin, globalMax: gMax + margin });
    if (window.draw) window.draw(true);
}

// Global exposure
window.handleSliderInput = handleSliderInput;
window.prevWindow = prevWindow;
window.nextWindow = nextWindow;
window.updateSliderMax = updateSliderMax;
window.rescaleSignalView = rescaleSignalView;
