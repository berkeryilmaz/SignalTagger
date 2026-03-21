/**
 * Otomatik Analiz Pipeline'ı
 * ============================
 *
 * Tek butonla sinyal analiz akışı:
 *   1. Sinyali ters çevir (invert)
 *   2. SG Wizard ile en uygun düzleştirme parametrelerini bul ve uygula
 *   3. Full histogram + Gaussian fit → mean'i baseline yap
 *   4. n × σ threshold ile peak detection
 *   5. Peak'leri baseline'a genişlet (expand)
 *
 * Tüm adımlar Promise tabanlı async zincir ile çalışır.
 */

// ─── Pipeline Ana Fonksiyonu ────────────────────────────────────────

async function runAutoAnalysis() {
    if (!state.signal || state.signal.length === 0) {
        return alert("Önce bir dosya yükleyin / Load a file first!");
    }

    // Parametreleri modaldan al
    const sigmaMultiplier = parseFloat(document.getElementById('autoSigmaN').value) || 3;
    const minWidth = parseInt(document.getElementById('autoMinWidth').value) || 10;

    closeModal('autoAnalysisModal');

    try {
        // ─── Adım 1: Sinyali Ters Çevir ────────────────────────
        showLoading("Auto-Analysis: Inverting Signal...", "Step 1/5");
        await delay(50);
        await invertSignalAsync();

        // ─── Adım 2: SG Wizard — En İyi Parametreyi Bul ve Uygula ─
        showLoading("Auto-Analysis: Finding Best SG Parameters...", "Step 2/5");
        await delay(50);
        await runSGWizardAsync();

        // ─── Adım 3: Histogram + Gaussian → Baseline & Sigma ──
        showLoading("Auto-Analysis: Histogram & Baseline...", "Step 3/5");
        await delay(50);
        const sigma = await runHistogramAndSetBaseline();

        // ─── Adım 4: Threshold Detection ───────────────────────
        showLoading("Auto-Analysis: Peak Detection...", "Step 4/5");
        await delay(50);
        await runThresholdDetectionAuto(sigma, sigmaMultiplier, minWidth);

        // ─── Adım 5: Expand Peaks to Baseline ──────────────────
        showLoading("Auto-Analysis: Expanding Peaks...", "Step 5/5");
        await delay(50);
        expandPeaksToBaseline();

        hideLoading();

        // Sonuçları göster
        const peakCount = findLabeledRegions(state.labels).filter(r => r.label === 2).length;
        alert(`Auto-Analysis tamamlandı!\n\n` +
            `• Sigma: ${sigma.toFixed(6)}\n` +
            `• Threshold: ${(state.baselineValue + sigmaMultiplier * sigma).toFixed(6)} (${sigmaMultiplier}σ)\n` +
            `• Bulunan peak sayısı: ${peakCount}`);

    } catch (e) {
        console.error("Auto-Analysis error:", e);
        hideLoading();
        alert("Auto-Analysis sırasında hata: " + e.message);
    }
}

// ─── Async Yardımcı Fonksiyonlar ────────────────────────────────────

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sinyali ters çevirir (Promise tabanlı).
 */
function invertSignalAsync() {
    return new Promise((resolve) => {
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

        if (window.recalcFilters) {
            // recalcFilters is async with setTimeout, wait for it
            waitForRecalcFilters().then(resolve);
        } else {
            if (window.draw) window.draw();
            resolve();
        }
    });
}

/**
 * recalcFilters'ın tamamlanmasını bekler.
 * hideLoading() çağrıldığında loading element display:none olur.
 */
function waitForRecalcFilters() {
    return new Promise((resolve) => {
        recalcFilters();

        // recalcFilters showLoading yapar, bitince hideLoading çağırır (display:none)
        // İlk showLoading'i bekle, sonra hideLoading'i bekle
        let started = false;
        const check = setInterval(() => {
            const loadingEl = document.getElementById('loading');
            if (!loadingEl) { clearInterval(check); resolve(); return; }

            const isVisible = loadingEl.style.display === 'flex';

            if (isVisible) {
                started = true;
            } else if (started) {
                // showLoading gösterildi, sonra gizlendi = tamamlandı
                clearInterval(check);
                resolve();
            }
        }, 50);

        // Safety timeout: 30 saniye
        setTimeout(() => {
            clearInterval(check);
            resolve();
        }, 30000);
    });
}

/**
 * SG Wizard'ı çalıştırır, en iyi parametre setini bulur ve uygular.
 * Full sinyal üzerinde çalışır.
 */
function runSGWizardAsync() {
    return new Promise((resolve) => {
        const testData = state.signal;

        let minW = 5, maxW = 51, minO = 2, maxO = 4;

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

        if (results.length > 0) {
            const best = results[0];
            console.log(`Auto SG: Best N=${best.w}, P=${best.o}, R²=${best.r2.toFixed(6)}`);

            // SG parametrelerini uygula
            elements.sgWindowInput.value = best.w;
            elements.sgOrderInput.value = best.o;

            // Smooth'u etkinleştir
            if (!state.isSmoothEnabled) {
                updateState({ isSmoothEnabled: true });
                if (elements.sgToggleBtn) elements.sgToggleBtn.classList.add("active-green");
                if (elements.sgSettingsPanel) elements.sgSettingsPanel.classList.add("show");
            }

            // recalcFilters'ı çalıştır ve bitişini bekle
            waitForRecalcFilters().then(resolve);
        } else {
            resolve();
        }
    });
}

/**
 * Full histogram + Gaussian fit yapar.
 * Mean'i baseline olarak ayarlar.
 * Sigma değerini döndürür.
 *
 * @returns {Promise<number>} Fitted sigma değeri
 */
function runHistogramAndSetBaseline() {
    return new Promise((resolve) => {
        // Full sinyal üzerinde histogram hesapla (UI açmadan)
        const src = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
        const dataArr = [];

        let step = 1;
        if (src.length > 2000000) step = Math.floor(src.length / 2000000);

        for (let i = 0; i < src.length; i += step) {
            dataArr.push(src[i]);
        }

        if (dataArr.length < 2) {
            resolve(0);
            return;
        }

        // Temel istatistikler
        let sum = 0;
        for (let v of dataArr) sum += v;
        let mean = sum / dataArr.length;
        let sumSqDiff = 0;
        for (let v of dataArr) sumSqDiff += Math.pow(v - mean, 2);
        let sigma = Math.sqrt(sumSqDiff / dataArr.length);

        // Optimal bin sayısı
        let numBins = calculateOptimalBins(dataArr);

        // Binleme
        let minVal = Infinity, maxVal = -Infinity;
        for (let v of dataArr) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }

        let range = maxVal - minVal;
        if (range === 0) range = 1;
        minVal -= range * 0.02;
        maxVal += range * 0.02;
        let binWidth = (maxVal - minVal) / numBins;

        let bins = new Array(numBins).fill(0);
        for (let v of dataArr) {
            let idx = Math.floor((v - minVal) / binWidth);
            if (idx >= numBins) idx = numBins - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
        }

        let fitX = [], fitY = [];
        let maxCount = 0, maxBinIdx = 0;

        for (let i = 0; i < numBins; i++) {
            let center = minVal + (i + 0.5) * binWidth;
            let count = bins[i];
            if (count > maxCount) { maxCount = count; maxBinIdx = i; }
            if (count > 0) {
                fitX.push(center);
                fitY.push(count);
            }
        }

        // Gaussian Fit
        let peakCenter = minVal + (maxBinIdx + 0.5) * binWidth;
        let initParams = [maxCount, peakCenter, sigma * 0.5];
        let result = fitGaussianLM(fitX, fitY, initParams);

        let fittedMean = result.mu;
        let fittedSigma = result.sigma;

        console.log(`Auto Histogram: mean=${fittedMean.toFixed(6)}, sigma=${fittedSigma.toFixed(6)}`);

        // Mean'i baseline yap
        if (!state.isBaselineEnabled) {
            updateState({ isBaselineEnabled: true });
            if (elements.baselineToggle) elements.baselineToggle.checked = true;
            if (elements.baselineInput) elements.baselineInput.disabled = false;
        }

        updateState({ baselineValue: fittedMean, currentGaussianMean: fittedMean });
        alignBaselineToZero()
        if (elements.baselineInput) {
            let prec = (state.dataPrecision !== undefined) ? state.dataPrecision + 2 : 5;
            elements.baselineInput.value = fittedMean.toFixed(prec);
        }

        // Gaussian sigma'yı state'e kaydet (pipeline'da kullanılacak)
        state._autoSigma = fittedSigma;

        if (window.draw) window.draw();

        resolve(fittedSigma);
    });
}

/**
 * Threshold detection'ı programatik olarak çalıştırır.
 * threshold = baseline + n × sigma
 */
function runThresholdDetectionAuto(sigma, n, minWidth) {
    return new Promise((resolve) => {
        const threshold = state.baselineValue + n * sigma;

        console.log(`Auto Threshold: baseline=${state.baselineValue.toFixed(6)}, ${n}×σ=${(n * sigma).toFixed(6)}, threshold=${threshold.toFixed(6)}, minWidth=${minWidth}`);

        // UI inputlarını da güncelle (kullanıcı görebilsin)
        const threshInput = document.getElementById("peakThreshold");
        const minWidthInput = document.getElementById("peakMinWidth");
        if (threshInput) threshInput.value = threshold;
        if (minWidthInput) minWidthInput.value = minWidth;

        const data = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
        let count = 0;
        let inRegion = false;
        let start = -1;

        for (let i = 0; i < data.length; i++) {
            if (data[i] > threshold) {
                if (!inRegion) { inRegion = true; start = i; }
            } else {
                if (inRegion) {
                    inRegion = false;
                    if (i - start >= minWidth) {
                        fillLabel(start, i - 1, 2);
                        count++;
                    }
                }
            }
        }
        if (inRegion && data.length - start >= minWidth) {
            fillLabel(start, data.length - 1, 2);
            count++;
        }

        console.log(`Auto Detection: Found ${count} peaks`);

        if (window.redrawCallback) window.redrawCallback();
        updatePeakAnalysis();

        resolve(count);
    });
}

// ─── Modal Açma ──────────────────────────────────────────────────────

function openAutoAnalysisModal() {
    if (!state.signal || state.signal.length === 0) {
        return alert("Önce bir dosya yükleyin / Load a file first!");
    }
    openModal('autoAnalysisModal');
}

// ─── Global Exposure ─────────────────────────────────────────────────
window.runAutoAnalysis = runAutoAnalysis;
window.openAutoAnalysisModal = openAutoAnalysisModal;

console.log("automation.js loaded successfully");
