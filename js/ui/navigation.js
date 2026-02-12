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

// Global exposure
window.handleSliderInput = handleSliderInput;
window.prevWindow = prevWindow;
window.nextWindow = nextWindow;
window.updateSliderMax = updateSliderMax;
