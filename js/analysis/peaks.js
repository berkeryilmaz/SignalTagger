/**
 * Puls (Peak) Analizi — Ana Orkestratör
 * =======================================
 *
 * Bu modül, etiketli bölgelerin analiz edilmesini koordine eder.
 * Bölge algılama, FWHM hesaplama ve fizik metrikleri ayrı modüllerden çağrılır:
 *   - js/analysis/region_detector.js  → findLabeledRegions()
 *   - js/analysis/physics.js          → calculateFWHM(), calculatePhysicsMetrics()
 *
 * Analiz Akışı:
 *   1. Etiketli bölgeleri tara (region_detector)
 *   2. Her bölge için istatistikleri hesapla (max, sum, sumSq)
 *   3. FWHM hesapla (physics)
 *   4. Fizik metriklerini hesapla: Q, E, eV (physics)
 *   5. Sonuçları window.analysisData'ya yaz
 *   6. Tablo güncelleme callback'ini çağır (analysis_ui)
 */

window.analysisData = [];

function updatePeakAnalysis(e, forceRebuild = false) {
    // Robust event handling
    if (e && e.stopPropagation) {
        e.stopPropagation();
    } else if (window.event) {
        window.event.cancelBubble = true;
    }

    if (!state.signal || state.signal.length === 0) return;

    const data = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
    const labels = state.labels;
    window.analysisData = [];

    if (!labels) {
        console.warn("No labels found in state");
        return;
    }

    // 1. Bölgeleri tara
    const regions = findLabeledRegions(labels);

    let countEl = document.getElementById("peak-count");
    if (countEl) countEl.textContent = `${regions.length} regions (scanned ${labels.length.toLocaleString()} pts)`;

    let base = state.isBaselineEnabled ? state.baselineValue : 0;

    // 2. Fizik parametrelerini al
    const physParams = getPhysicsParams();

    regions.forEach((r, index) => {
        let width = r.end - r.start + 1;
        let maxVal = -Infinity;
        let maxIndex = -1;
        let area = 0;
        let sumVSq = 0;

        // 3. Bölge istatistikleri
        for (let j = r.start; j <= r.end; j++) {
            let val = data[j];
            if (val > maxVal) {
                maxVal = val;
                maxIndex = j;
            }
            let diff = val - base;
            area += diff;
            sumVSq += (diff * diff);
        }

        // 4. FWHM hesapla
        let fwhm = calculateFWHM(data, r.start, r.end, maxVal, maxIndex, base);

        // 5. Fizik metrikleri
        let physics = calculatePhysicsMetrics({ area, sumVSq }, physParams);

        window.analysisData.push({
            id: index + 1,
            label: r.label,
            start: r.start,
            end: r.end,
            width: width,
            fwhm: fwhm,
            maxVal: maxVal,
            area: area,
            sumVSq: sumVSq,
            charge: physics.charge,
            energy: physics.energy,
            energyEV: physics.energyEV
        });
    });

    if (window.renderAnalysisTable) window.renderAnalysisTable(forceRebuild);
}

// Global exposure
window.updatePeakAnalysis = updatePeakAnalysis;
window.analysisData = window.analysisData || [];
