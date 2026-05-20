/**
 * Bölge Algılama Modülü — Region Detection
 * ==========================================
 *
 * Bu modül, sinyal verisi üzerinde etiketli (labeled) bölgeleri
 * tanımlama ve eşik tabanlı otomatik algılama işlemlerini içerir.
 *
 * ─── Etiketli Bölge Tarama ──────────────────────────────────────
 *
 * Sinyal etiketleri (labels), her örnekleme noktası için bir sınıf
 * numarası tutar (0 = etiketsiz). Ardışık aynı etiketli noktalar
 * bir "bölge" (region) oluşturur.
 *
 * Algoritma: Tek geçişli (single-pass) durum makinesi
 *   - O(n) zaman karmaşıklığı
 *   - Bellek: O(k) burada k = bölge sayısı
 *
 * ─── Eşik Tabanlı Algılama (Threshold Detection) ───────────────
 *
 * Basit ama etkili bir yöntem:
 *   1. Sinyal değeri > threshold olan noktalar olay bölgesine girer
 *   2. Sinyal ≤ threshold'a düşünce bölge kapanır
 *   3. Minimum genişlik koşulu uygulanır (gürültü filtresi)
 *
 * Bu, nükleer/parçacık fiziğinde "discriminator" mantığına benzer.
 * Referans: Knoll, G.F. "Radiation Detection and Measurement",
 *           4th Ed., Wiley, 2010, §17.II (Pulse Height Analysis)
 *
 * ─── Tepe Genişletme (Expand Peaks to Baseline) ─────────────────
 *
 * İşaretlenmiş tepe bölgelerini, sinyal baseline'a dönene kadar
 * her iki yönde genişletir. Bu, tam puls alanının yakalanması için
 * önemlidir; aksi takdirde enerji/yük hesaplamaları eksik kalır.
 *
 * Algoritma: Her işaretli segmentin sol ve sağ sınırından itibaren,
 * sinyal baseline'ın altına düşene kadar etiketler genişletilir.
 */

/**
 * Etiketli bölgeleri tek geçişte (single-pass) tarar ve listeler.
 *
 * @param {Int8Array|number[]} labels - Etiket dizisi
 * @returns {object[]} Bölge listesi [{ start, end, label }]
 */
function findLabeledRegions(labels) {
    if (!labels) return [];

    let regions = [];
    let currentLabel = 0;
    let start = -1;
    const L = labels.length;

    for (let i = 0; i < L; i++) {
        let val = labels[i];
        let lbl = (val === undefined || val === null) ? 0 : val;

        if (lbl !== currentLabel) {
            // Mevcut bölgeyi kapat
            if (currentLabel !== 0) {
                regions.push({ start: start, end: i - 1, label: currentLabel });
            }
            // Yeni bölge başlat
            if (lbl !== 0) {
                start = i;
            }
            currentLabel = lbl;
        }
    }

    // Son bölgeyi kapat
    if (currentLabel !== 0) {
        regions.push({ start: start, end: L - 1, label: currentLabel });
    }

    return regions;
}

/**
 * Eşik tabanlı puls algılama.
 * Sinyal > threshold olan ve minimum genişliği sağlayan bölgeleri bulur.
 */
function runThresholdDetection() {
    if (!state.signal) return;
    let threshold = parseFloat(document.getElementById("peakThreshold").value) || 0;
    let minWidth = parseInt(document.getElementById("peakMinWidth").value) || 10;

    const data = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
    const baseline = state.baselineValue || 0;
    const isNegative = threshold < baseline;
    const checkFn = isNegative ? (val) => val < threshold : (val) => val > threshold;

    let count = 0;
    let inRegion = false;
    let start = -1;

    for (let i = 0; i < data.length; i++) {
        if (checkFn(data[i])) {
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

    document.getElementById("peakResultMsg").textContent = `Found ${count} peaks via Threshold.`;
    if (window.redrawCallback) window.redrawCallback();
    updatePeakAnalysis();
}

/**
 * Belirtilen aralıktaki etiketleri doldurur.
 */
function fillLabel(start, end, type) {
    for (let i = start; i <= end; i++) state.labels[i] = type;
}

/**
 * İşaretli tepe bölgelerini baseline'a kadar genişletir.
 */
function expandPeaksToBaseline() {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    let modifiedCount = 0;
    const baseline = state.baselineValue;
    const data = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
    const labels = state.labels;

    // Mevcut "Peak" (label=2) segmentlerini bul
    let peakSegments = [];
    let inPeak = false;
    let start = -1;

    for (let i = 0; i < labels.length; i++) {
        if (labels[i] === 2) {
            if (!inPeak) {
                start = i;
                inPeak = true;
            }
        } else {
            if (inPeak) {
                peakSegments.push({ start: start, end: i - 1 });
                inPeak = false;
            }
        }
    }
    if (inPeak) peakSegments.push({ start: start, end: labels.length - 1 });

    if (peakSegments.length === 0) return alert("No peaks marked to expand.");

    // Her segmenti sola ve sağa genişlet
    peakSegments.forEach(seg => {
        // Peak yönünü belirle: En yüksek mutlak sapma yönü
        let maxDev = 0;
        let peakDir = 1; // 1: Pozitif, -1: Negatif
        for (let i = seg.start; i <= seg.end; i++) {
            let dev = data[i] - baseline;
            if (Math.abs(dev) > Math.abs(maxDev)) {
                maxDev = dev;
                peakDir = dev >= 0 ? 1 : -1;
            }
        }

        let left = seg.start - 1;
        if (peakDir === 1) {
            while (left >= 0 && data[left] > baseline && labels[left] !== 2) {
                labels[left] = 2;
                modifiedCount++;
                left--;
            }
        } else {
            while (left >= 0 && data[left] < baseline && labels[left] !== 2) {
                labels[left] = 2;
                modifiedCount++;
                left--;
            }
        }

        let right = seg.end + 1;
        if (peakDir === 1) {
            while (right < data.length && data[right] > baseline && labels[right] !== 2) {
                labels[right] = 2;
                modifiedCount++;
                right++;
            }
        } else {
            while (right < data.length && data[right] < baseline && labels[right] !== 2) {
                labels[right] = 2;
                modifiedCount++;
                right++;
            }
        }
    });

    const msg = document.getElementById("peakResultMsg");
    if (msg) msg.textContent = `Expanded peaks by ${modifiedCount} points.`;

    if (window.redrawCallback) window.redrawCallback(false);
    updatePeakAnalysis();
}

/**
 * Prominence tabanlı algılama (henüz tam uyarlanmadı).
 */
function runProminenceDetection() {
    document.getElementById("peakResultMsg").textContent = "Prominence detection not fully ported in this step.";
}

/**
 * Jump ve redraw callback'lerini ayarlar.
 */
function setCallbacks(jump, redraw) {
    window.jumpToCallback = jump;
    window.redrawCallback = redraw;
}

// Global exposure
window.findLabeledRegions = findLabeledRegions;
window.runThresholdDetection = runThresholdDetection;
window.runProminenceDetection = runProminenceDetection;
window.setCallbacks = setCallbacks;
window.expandPeaksToBaseline = expandPeaksToBaseline;
window.fillLabel = fillLabel;
