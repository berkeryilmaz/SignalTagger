// Core State
const state = {
    // Data
    signal: null,
    labels: null,
    smoothedSignal: null,
    derivativeSignal: null,
    rawDerivativeSignal: null,
    smoothDerivativeSignal: null,
    referenceSignals: [],
    scopeMetadata: null,

    // Configuration
    dataPrecision: 3,
    windowSize: 1520,
    stride: 1520,
    windowStart: 0,

    // Analysis State
    globalMin: Infinity,
    globalMax: -Infinity,

    // UI State
    isPlaying: false,
    playInterval: null,
    isSizeStrideLocked: false,

    // Flags
    showDerivative: false,
    isSmoothEnabled: false,
    sgWindow: 11,
    sgOrder: 2,

    // Baseline
    baselineValue: 0,
    isBaselineEnabled: false,

    // Histogram
    currentGaussianMean: 0,
    currentHistoData: [],

    // Physics
    physics: {
        R: 50,
        R_unit: 'ohm',
        dt: 200,
        dt_unit: 'n'
    },

    unitMultipliers: {
        'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3,
        'k': 1e3, 'M': 1e6, 'G': 1e9,
        'ohm': 1, 's': 1, 'eV': 1
    },

    // Constants
    labelTypes: {
        0: { name: 'None', color: 'transparent' },
        1: { name: 'Rise', color: '#3f7ae0' },
        2: { name: 'Peak', color: '#e03f6f' },
        3: { name: 'Tail', color: '#f2b705' },
        4: { name: 'Artifact', color: '#2bb673' },
        5: { name: 'Unknown', color: '#8e44ad' }
    },

    currentLabelType: 1
};

function updateState(updates) {
    Object.assign(state, updates);
}

function resetState() {
    state.smoothedSignal = null;
    state.derivativeSignal = null;
    state.rawDerivativeSignal = null;
    state.smoothDerivativeSignal = null;
}

// Expose to window explicitly if strictly needed, but top-level var/const/function in classic script is global.
// However, 'const' is block-scoped, so in global scope it IS global but not on 'window' property in strict mode?
// Actually in browser global scope, const/let are not attached to window, but are accessible globally.
// To be safe and compatible with previous inline-style calls, let's just keep them as top-level.
// To ensure window.state works if accessed that way:
window.state = state;
window.updateState = updateState;
window.resetState = resetState;
