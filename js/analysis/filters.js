/**
 * Sinyal Filtreleme — Savitzky-Golay Filtresi
 * =============================================
 *
 * Teori: Savitzky-Golay Düzleştirme Filtresi
 * ─────────────────────────────────────────────
 * Veriye hareketli bir pencere içinde en küçük kareler yöntemiyle
 * polinom uydurur. Klasik hareketli ortalamadan farklı olarak,
 * sinyal tepe noktalarını ve şeklini daha iyi korur.
 *
 * Parametreler:
 *   w (pencere) = 2m+1 nokta (m: yarı-genişlik)
 *   p (derece)  = polinom derecesi (p < w olmalı)
 *
 * Filtrelenmiş değer, katsayılarla konvolüsyondur:
 *   ŷ(i) = Σ_{j=-m}^{m} c_j · y(i+j)
 *
 * Katsayılar math_utils.js'deki calcSGWeights() ile hesaplanır.
 *
 * Türev (d/dx):
 * Sonlu farklar yöntemiyle merkezi türev:
 *   y'(i) ≈ (y(i+1) - y(i-1)) / 2
 *
 * Referans:
 *   Savitzky, A.; Golay, M.J.E. (1964). Analytical Chemistry.
 *   36(8): 1627–1639. doi:10.1021/ac60214a047
 *
 *   Steinier, J.; Termonia, Y.; Deltour, J. (1972).
 *   Analytical Chemistry. 44(11): 1906–1909.
 *
 * R² (Belirleme Katsayısı):
 * ─────────────────────────
 * Filtrenin orijinal sinyali ne kadar iyi koruduğunu ölçer:
 *   R² = 1 - SS_res / SS_tot
 *   SS_res = Σ (yᵢ - ŷᵢ)²   (artık kareler toplamı)
 *   SS_tot = Σ (yᵢ - ȳ)²    (toplam kareler toplamı)
 *
 * R² → 1: mükemmel koruma, R² → 0: çok fazla düzleştirme
 */

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

        // rawDerivativeSignal tahsisi
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

        // SG katsayıları (math_utils.js'den)
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

            // 1. Ham Türev: y'(i) ≈ (y(i+1) - y(i-1)) / 2
            for (let i = offset; i < end; i++) {
                if (i === 0 || i === totalLen - 1) {
                    rawDeriv[i] = 0;
                } else {
                    rawDeriv[i] = Math.round(((signal[i + 1] - signal[i - 1]) / 2) * factor) / factor;
                }
            }

            // 2. SG Düzleştirme & Düzleştirilmiş Türev
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

/**
 * SG filtresini tüm veriye uygular (bağımsız fonksiyon).
 * SG Wizard tarafından kullanılır.
 */
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

/**
 * R² belirleme katsayısını hesaplar.
 */
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

window.toggleSmooth = toggleSmooth;
window.recalcFilters = recalcFilters;
window.applySmoothingToRaw = applySmoothingToRaw;
window.applySavitzkyGolay = applySavitzkyGolay;
window.calculateR2 = calculateR2;
