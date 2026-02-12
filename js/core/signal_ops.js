// Core: Signal Operations

function invertSignal() {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");
    if (window.showLoading) window.showLoading("Inverting Signal...");

    setTimeout(() => {
        const signal = state.signal;
        for (let i = 0; i < signal.length; i++) {
            signal[i] = -signal[i];
        }
        let tempMin = state.globalMin;
        state.globalMin = -state.globalMax;
        state.globalMax = -tempMin;

        if (state.isBaselineEnabled) {
            let b = window.roundToPrecision ? window.roundToPrecision(-state.baselineValue) : -state.baselineValue;
            state.baselineValue = b;
            if (elements.baselineInput) elements.baselineInput.value = b;
        }

        if (window.recalcFilters) window.recalcFilters();
        if (window.draw) window.draw();
        if (window.hideLoading) window.hideLoading();
    }, 10);
}

function updatePrecision() {
    let val = parseInt(elements.precisionInput.value) || 5;
    state.dataPrecision = val;

    if (state.signal && state.signal.length > 0) {
        if (window.recalcFilters) window.recalcFilters();
        if (state.isBaselineEnabled) {
            state.baselineValue = window.roundToPrecision(state.baselineValue);
            if (elements.baselineInput) elements.baselineInput.value = state.baselineValue;
        }
        if (window.draw) window.draw(false);
    }
}

// Expose globals
// Expose globals
window.invertSignal = invertSignal;
window.updatePrecision = updatePrecision;
window.alignBaselineToZero = alignBaselineToZero;

function alignBaselineToZero() {
    if (!state.signal) return;
    let offset = state.baselineValue;
    if (offset === 0) return;

    if (window.showLoading) window.showLoading("Adjusting Baseline...");
    setTimeout(() => {
        const signal = state.signal;
        for (let i = 0; i < signal.length; i++) {
            signal[i] = signal[i] - offset;
        }
        state.globalMin = state.globalMin - offset;
        state.globalMax = state.globalMax - offset;
        state.baselineValue = 0;

        if (elements.baselineInput) elements.baselineInput.value = 0;

        if (!state.isBaselineEnabled) {
            state.isBaselineEnabled = true;
            if (elements.baselineToggle) elements.baselineToggle.checked = true;
            if (elements.baselineInput) elements.baselineInput.disabled = false;
        }

        if (window.recalcFilters) window.recalcFilters();
        if (window.draw) window.draw();
        if (window.hideLoading) window.hideLoading();
    }, 50);
}
