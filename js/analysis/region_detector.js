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

/**
 * Çakışan veya bitişik bölgeleri tek bir bölge olarak birleştirir (Merge Overlapping Regions).
 *
 * @param {Array<object>} regions - [{ start, end, label, ... }]
 * @param {object} [options]
 * @param {number} [options.maxGap=0] - Birleştirmek için izin verilen maksimum örnek boşluğu
 * @param {boolean} [options.mergeAdjacent=true] - Bitişik (gap=0) bölgeleri birleştir
 * @param {string} [options.mergeBy='all'] - 'all' (tüm etiketler) veya 'same_label' (sadece aynı etiketliler)
 * @param {string} [options.labelResolution='first'] - 'first', 'dominant', 'last'
 * @param {Float32Array|Array} [options.signal=null] - İsteğe bağlı sinyal dizisi
 * @returns {Array<object>} Birleştirilmiş bölge listesi
 */
function mergeOverlappingRegions(regions, options = {}) {
    if (!regions || !Array.isArray(regions) || regions.length === 0) return [];

    let maxGap = typeof options.maxGap === 'number' ? Math.max(0, options.maxGap) : (parseFloat(options.maxGap) || 0);
    let mergeAdjacent = options.mergeAdjacent === true || options.mergeAdjacent === 'true' || options.mergeAdjacent === undefined;
    let mergeBy = options.mergeBy || 'all';
    let labelResolution = options.labelResolution || 'first';
    let sig = options.signal || null;

    let cleaned = regions.filter(r => r && typeof r === 'object').map((r, i) => {
        let s = Math.round(Number(r.start) || 0);
        let e = Math.round(Number(r.end) || 0);
        if (s > e) { let tmp = s; s = e; e = tmp; }
        return {
            ...r,
            _origId: r.id !== undefined ? r.id : (i + 1),
            start: s,
            end: e,
            width: e - s + 1,
            label: r.label !== undefined ? r.label : 2
        };
    });

    if (cleaned.length === 0) return [];

    function mergeIntervalGroup(group) {
        if (group.length <= 1) return group.map(r => ({ ...r, constituents: [r] }));

        group.sort((a, b) => a.start - b.start || a.end - b.end);

        let merged = [];
        let current = {
            ...group[0],
            constituents: [group[0]]
        };

        for (let i = 1; i < group.length; i++) {
            let next = group[i];
            let maxReach = current.end + (mergeAdjacent ? 1 : 0) + maxGap;
            if (next.start <= maxReach) {
                current.end = Math.max(current.end, next.end);
                current.width = current.end - current.start + 1;
                current.constituents.push(next);
            } else {
                merged.push(current);
                current = {
                    ...next,
                    constituents: [next]
                };
            }
        }
        merged.push(current);
        return merged;
    }

    let mergedGroups = [];
    if (mergeBy === 'same_label') {
        let byLabel = {};
        cleaned.forEach(r => {
            let key = r.label;
            if (!byLabel[key]) byLabel[key] = [];
            byLabel[key].push(r);
        });
        Object.keys(byLabel).forEach(lblKey => {
            mergedGroups.push(...mergeIntervalGroup(byLabel[lblKey]));
        });
        mergedGroups.sort((a, b) => a.start - b.start || a.end - b.end);
    } else {
        mergedGroups = mergeIntervalGroup(cleaned);
    }

    return mergedGroups.map((m, idx) => {
        let consts = m.constituents || [m];
        let chosenLabel = m.label;

        if (consts.length > 1) {
            if (labelResolution === 'last') {
                chosenLabel = consts[consts.length - 1].label;
            } else if (labelResolution === 'dominant') {
                let dom = consts.reduce((prev, curr) => (curr.width > prev.width ? curr : prev), consts[0]);
                chosenLabel = dom.label;
            } else {
                chosenLabel = consts[0].label;
            }
        }

        let finalStart = m.start;
        let finalEnd = m.end;

        if (sig && sig.length) {
            finalStart = Math.max(0, Math.min(finalStart, sig.length - 1));
            finalEnd = Math.max(0, Math.min(finalEnd, sig.length - 1));
            if (finalStart > finalEnd) finalEnd = finalStart;
        }

        let res = {
            ...consts[0],
            id: idx + 1,
            start: finalStart,
            end: finalEnd,
            width: finalEnd - finalStart + 1,
            label: chosenLabel,
            mergedFromCount: consts.length
        };
        delete res._origId;
        delete res.constituents;

        if (sig && sig.length && finalStart < sig.length) {
            let maxVal = -Infinity, minVal = Infinity, maxIdx = finalStart, minIdx = finalStart;
            for (let j = finalStart; j <= finalEnd; j++) {
                let v = sig[j];
                if (v > maxVal) { maxVal = v; maxIdx = j; }
                if (v < minVal) { minVal = v; minIdx = j; }
            }
            if (res.max !== undefined || consts.some(c => c.max !== undefined)) res.max = maxVal;
            if (res.min !== undefined || consts.some(c => c.min !== undefined)) res.min = minVal;
            if (res.peakVal !== undefined || consts.some(c => c.peakVal !== undefined)) {
                let isNeg = Math.abs(minVal) > Math.abs(maxVal);
                res.peakVal = isNeg ? minVal : maxVal;
            }
            if (res.extremumIndex !== undefined) res.extremumIndex = maxIdx;
            if (res.extremumValue !== undefined) res.extremumValue = maxVal;
        } else if (consts.length > 1) {
            if (consts.some(c => c.max !== undefined)) {
                res.max = Math.max(...consts.map(c => c.max !== undefined ? c.max : -Infinity));
            }
            if (consts.some(c => c.min !== undefined)) {
                res.min = Math.min(...consts.map(c => c.min !== undefined ? c.min : Infinity));
            }
            if (consts.some(c => c.charge !== undefined)) {
                res.charge = consts.reduce((acc, c) => acc + (c.charge || 0), 0);
            }
            if (consts.some(c => c.energy !== undefined)) {
                res.energy = consts.reduce((acc, c) => acc + (c.energy || 0), 0);
            }
            if (consts.some(c => c.area !== undefined)) {
                res.area = consts.reduce((acc, c) => acc + (c.area || 0), 0);
            }
        }

        return res;
    });
}

// Global exposure
window.findLabeledRegions = findLabeledRegions;
window.runThresholdDetection = runThresholdDetection;
window.runProminenceDetection = runProminenceDetection;
window.setCallbacks = setCallbacks;
window.expandPeaksToBaseline = expandPeaksToBaseline;
window.fillLabel = fillLabel;
window.mergeOverlappingRegions = mergeOverlappingRegions;
