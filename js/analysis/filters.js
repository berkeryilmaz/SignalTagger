// Analysis: Filters

let isCalculating = false;

function toggleSmooth() {
    updateState({ isSmoothEnabled: !state.isSmoothEnabled });
    if (state.isSmoothEnabled) {
        if (elements.sgToggleBtn) elements.sgToggleBtn.classList.add("active-green");
        if (elements.sgSettingsPanel) elements.sgSettingsPanel.classList.add("show");
        recalcFilters();
    } else {
        if (elements.sgToggleBtn) elements.sgToggleBtn.classList.remove("active-green");
        if (elements.sgSettingsPanel) elements.sgSettingsPanel.classList.remove("show");
        updateState({ smoothedSignal: null, smoothDerivativeSignal: null });
        draw(true);
    }
}

function recalcFilters() {
    if (!state.signal || state.signal.length === 0) {
        hideLoading();
        return;
    }
    if (isCalculating) return;
    isCalculating = true;

    showLoading("Calculating Filters...", "Initializing...");

    setTimeout(() => {
        let w = parseInt(elements.sgWindowInput.value) || 11;
        if (w % 2 === 0) w++;
        elements.sgWindowInput.value = w;
        let o = parseInt(elements.sgOrderInput.value) || 2;
        updateState({ sgWindow: w, sgOrder: o });

        let factor = Math.pow(10, state.dataPrecision);
        let totalLen = state.signal.length;

        const CHUNK_SIZE = 500000;

        // Allocate rawDerivativeSignal if needed
        let rawDeriv = state.rawDerivativeSignal;
        if (!rawDeriv || rawDeriv.length !== totalLen) {
            rawDeriv = new Float32Array(totalLen);
            updateState({ rawDerivativeSignal: rawDeriv });
        }

        let smoothed = null;
        let smoothDeriv = null;

        if (state.isSmoothEnabled) {
            if (!state.smoothedSignal || state.smoothedSignal.length !== totalLen) {
                smoothed = new Float32Array(totalLen);
                updateState({ smoothedSignal: smoothed });
            } else {
                smoothed = state.smoothedSignal;
            }

            if (!state.smoothDerivativeSignal || state.smoothDerivativeSignal.length !== totalLen) {
                smoothDeriv = new Float32Array(totalLen);
                updateState({ smoothDerivativeSignal: smoothDeriv });
            } else {
                smoothDeriv = state.smoothDerivativeSignal;
            }
        } else {
            updateState({ smoothedSignal: null, smoothDerivativeSignal: null });
        }

        // SG Weights
        let sgWeights = null;
        let sgM = 0;
        if (state.isSmoothEnabled) {
            if (o >= w) o = w - 1;
            sgM = Math.floor(w / 2);
            sgWeights = calcSGWeights(sgM, o);
        }

        let offset = 0;
        const signal = state.signal;

        function processChunk() {
            let end = Math.min(offset + CHUNK_SIZE, totalLen);

            // 1. Raw Derivative
            for (let i = offset; i < end; i++) {
                if (i === 0 || i === totalLen - 1) {
                    rawDeriv[i] = 0;
                } else {
                    rawDeriv[i] = Math.round(((signal[i + 1] - signal[i - 1]) / 2) * factor) / factor;
                }
            }

            // 2. Smoothing & Smooth Derivative
            if (state.isSmoothEnabled) {
                for (let i = offset; i < end; i++) {
                    if (i < sgM || i >= totalLen - sgM) {
                        smoothed[i] = signal[i];
                    } else {
                        let sum = 0;
                        for (let j = -sgM; j <= sgM; j++) {
                            sum += signal[i + j] * sgWeights[j + sgM];
                        }
                        smoothed[i] = sum;
                    }
                }

                for (let i = offset; i < end; i++) {
                    if (i === 0 || i === totalLen - 1) {
                        smoothDeriv[i] = 0;
                    } else {
                        smoothDeriv[i] = Math.round(((smoothed[i + 1] - smoothed[i - 1]) / 2) * factor) / factor;
                    }
                }
            }

            offset = end;
            let progress = Math.round((offset / totalLen) * 100);
            updateProgressBar(progress);
            if (elements.loadingText) elements.loadingText.textContent = `Calculating Filters... ${progress}%`;

            if (offset < totalLen) {
                setTimeout(processChunk, 0);
            } else {
                isCalculating = false;
                hideLoading();
                draw(true);
            }
        }

        processChunk();

    }, 50);
}

function calcSGWeights(m, order) {
    const size = 2 * m + 1;
    let A = [];
    for (let i = -m; i <= m; i++) {
        let row = [];
        for (let j = 0; j <= order; j++) {
            row.push(Math.pow(i, j));
        }
        A.push(row);
    }

    let AT = A[0].map((_, c) => A.map(r => r[c]));
    let ATA = multiplyMatrices(AT, A);
    let ATAInv = invertMatrix(ATA);
    let coeffs = multiplyMatrices(ATAInv, AT);

    return coeffs[0];
}

function multiplyMatrices(A, B) {
    let result = new Array(A.length).fill(0).map(() => new Array(B[0].length).fill(0));
    return result.map((row, i) => {
        return row.map((val, j) => {
            return A[i].reduce((sum, elm, k) => sum + (elm * B[k][j]), 0);
        });
    });
}

function invertMatrix(M) {
    let n = M.length;
    let A = JSON.parse(JSON.stringify(M));
    let I = [];
    for (let i = 0; i < n; i++) { I[i] = []; for (let j = 0; j < n; j++) I[i][j] = (i === j) ? 1 : 0; }

    for (let i = 0; i < n; i++) {
        let piv = A[i][i];
        for (let j = 0; j < n; j++) { A[i][j] /= piv; I[i][j] /= piv; }
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                let f = A[k][i];
                for (let j = 0; j < n; j++) { A[k][j] -= f * A[i][j]; I[k][j] -= f * I[i][j]; }
            }
        }
    }
    return I;
}

function applySmoothingToRaw() {
    if (!state.isSmoothEnabled || !state.smoothedSignal) return alert("Please enable smoothing first.");
    if (!confirm("Overwrite raw signal with smoothed version? This cannot be undone.")) return;

    state.signal.set(state.smoothedSignal);
    updateState({
        isSmoothEnabled: false,
        smoothedSignal: null,
        smoothDerivativeSignal: null
    });

    if (elements.sgToggleBtn) elements.sgToggleBtn.classList.remove("active-green");
    if (elements.sgSettingsPanel) elements.sgSettingsPanel.classList.remove("show");

    recalcFilters();
}

function applySavitzkyGolay(data, windowSize, order) {
    let m = Math.floor(windowSize / 2);
    let weights = calcSGWeights(m, order);
    let result = new Float32Array(data.length);

    for (let i = 0; i < data.length; i++) {
        if (i < m || i >= data.length - m) {
            result[i] = data[i];
        } else {
            let sum = 0;
            for (let j = -m; j <= m; j++) {
                sum += data[i + j] * weights[j + m];
            }
            result[i] = sum;
        }
    }
    return result;
}

function calculateR2(original, smoothed) {
    let ssRes = 0;
    let ssTot = 0;
    let mean = 0;
    for (let v of original) mean += v;
    mean /= original.length;

    for (let i = 0; i < original.length; i++) {
        ssRes += Math.pow(original[i] - smoothed[i], 2);
        ssTot += Math.pow(original[i] - mean, 2);
    }
    return 1 - (ssRes / ssTot);
}

window.toggleSmooth = toggleSmooth;
window.recalcFilters = recalcFilters;
window.applySmoothingToRaw = applySmoothingToRaw;
window.applySavitzkyGolay = applySavitzkyGolay;
window.calculateR2 = calculateR2;
