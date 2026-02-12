// Core: Events & Input Handling

function handleKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === "ArrowRight") {
        if (window.nextWindow) window.nextWindow();
    } else if (e.key === "ArrowLeft") {
        if (window.prevWindow) window.prevWindow();
    } else if (e.key === " ") {
        if (window.togglePlay) window.togglePlay();
    } else if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        if (window.setLabelType) window.setLabelType(parseInt(e.key));
    } else if (e.key === '0' || e.key === '`') {
        if (window.setLabelType) window.setLabelType(0);
    }
}

function handleKeyup(e) {
    // Placeholder for future key up logic
}

function setupEventListeners() {
    // Keyboard
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("keyup", handleKeyup);

    // Inputs
    if (elements.fileInput) elements.fileInput.addEventListener("change", window.loadCSV);

    if (elements.windowSizeInput) {
        elements.windowSizeInput.addEventListener("change", (e) => {
            let val = parseInt(e.target.value);
            if (val && val > 0) {
                updateState({ windowSize: val });
                if (state.isSizeStrideLocked) {
                    updateState({ stride: val });
                    if (elements.strideInput) elements.strideInput.value = val;
                }
                if (window.updateSliderMax) window.updateSliderMax();
                if (window.draw) window.draw(true);
            }
        });
    }

    if (elements.strideInput) {
        elements.strideInput.addEventListener("change", (e) => {
            let val = parseInt(e.target.value);
            if (val && val > 0) {
                updateState({ stride: val });
                if (state.isSizeStrideLocked) {
                    updateState({ windowSize: val });
                    if (elements.windowSizeInput) elements.windowSizeInput.value = val;
                }
                if (window.draw) window.draw(true);
            }
        });
    }
}

// Global exposure
window.handleKeydown = handleKeydown;
window.handleKeyup = handleKeyup;
window.setupEventListeners = setupEventListeners;
