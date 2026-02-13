// Analysis: Peaks

window.analysisData = [];

function updatePeakAnalysis(e) {
    if (e) e.stopPropagation();
    if (!state.signal || state.signal.length === 0) return;

    const data = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
    const labels = state.labels;
    window.analysisData = [];

    let currentLabel = 0;
    let start = -1;
    let regions = [];

    // Identify all contiguous regions of non-zero labels
    for (let i = 0; i < labels.length; i++) {
        let lbl = labels[i];
        if (lbl !== currentLabel) {
            // End of previous region
            if (currentLabel !== 0) {
                regions.push({ start: start, end: i - 1, label: currentLabel });
            }
            // Start of new region
            if (lbl !== 0) {
                start = i;
            }
            currentLabel = lbl;
        }
    }
    // Handle last region
    if (currentLabel !== 0) {
        regions.push({ start: start, end: labels.length - 1, label: currentLabel });
    }

    let countEl = document.getElementById("peak-count");
    if (countEl) countEl.textContent = `${regions.length} regions found`;

    let base = state.isBaselineEnabled ? state.baselineValue : 0;

    regions.forEach((r, index) => {
        let width = r.end - r.start + 1;
        let maxVal = -Infinity;
        let maxIndex = -1;
        let area = 0;

        for (let j = r.start; j <= r.end; j++) {
            let val = data[j];
            if (val > maxVal) {
                maxVal = val;
                maxIndex = j;
            }
            area += (val - base);
        }

        // FWHM Calculation
        let fwhm = 0;
        if (maxIndex !== -1) {
            let halfMax = (maxVal - base) / 2 + base;

            // Find left crossing
            let leftIdx = maxIndex;
            while (leftIdx > r.start && data[leftIdx] > halfMax) {
                leftIdx--;
            }
            // Linear interpolate left
            let fwhmStart = leftIdx;
            if (data[leftIdx] <= halfMax && data[leftIdx + 1] > halfMax) {
                let v1 = data[leftIdx];
                let v2 = data[leftIdx + 1];
                fwhmStart = leftIdx + (halfMax - v1) / (v2 - v1);
            }

            // Find right crossing
            let rightIdx = maxIndex;
            while (rightIdx < r.end && data[rightIdx] > halfMax) {
                rightIdx++;
            }
            // Linear interpolate right
            let fwhmEnd = rightIdx;
            if (data[rightIdx] <= halfMax && data[rightIdx - 1] > halfMax) {
                let v1 = data[rightIdx - 1]; // higher
                let v2 = data[rightIdx];     // lower
                // Interpolate between rightIdx-1 and rightIdx
                // x = (y - y1) / (y2 - y1) + x1
                // Here x1 = rightIdx-1, x2 = rightIdx
                // fwhmEnd = (rightIdx - 1) + (halfMax - v1) / (v2 - v1);
                fwhmEnd = (rightIdx - 1) + (halfMax - v1) / (v2 - v1);
            }

            fwhm = fwhmEnd - fwhmStart;
            if (fwhm < 0) fwhm = 0;
        }

        window.analysisData.push({
            id: index + 1,
            label: r.label,
            start: r.start,
            end: r.end,
            width: width,
            fwhm: roundToPrecision(fwhm),
            maxVal: roundToPrecision(maxVal),
            area: roundToPrecision(area)
        });
    });

    if (window.renderAnalysisTable) window.renderAnalysisTable();
}

function runThresholdDetection() {
    if (!state.signal) return;
    let threshold = parseFloat(document.getElementById("peakThreshold").value) || 0;
    let minWidth = parseInt(document.getElementById("peakMinWidth").value) || 10;

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

    document.getElementById("peakResultMsg").textContent = `Found ${count} peaks via Threshold.`;
    if (window.redrawCallback) window.redrawCallback();
}

function fillLabel(start, end, type) {
    for (let i = start; i <= end; i++) state.labels[i] = type;
}

function runProminenceDetection() {
    document.getElementById("peakResultMsg").textContent = "Prominence detection not fully ported in this step.";
}

function setCallbacks(jump, redraw) {
    window.jumpToCallback = jump;
    window.redrawCallback = redraw;
}

function expandPeaksToBaseline() {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    let modifiedCount = 0;
    const baseline = state.baselineValue;
    const data = state.isSmoothEnabled ? state.smoothedSignal : state.signal;
    const labels = state.labels;

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

    peakSegments.forEach(seg => {
        let left = seg.start - 1;
        while (left >= 0 && data[left] > baseline && labels[left] !== 2) {
            labels[left] = 2;
            modifiedCount++;
            left--;
        }

        let right = seg.end + 1;
        while (right < data.length && data[right] > baseline && labels[right] !== 2) {
            labels[right] = 2;
            modifiedCount++;
            right++;
        }
    });

    const msg = document.getElementById("peakResultMsg");
    if (msg) msg.textContent = `Expanded peaks by ${modifiedCount} points.`;

    if (window.redrawCallback) window.redrawCallback(false);
    updatePeakAnalysis();
}

// Global exposure
window.updatePeakAnalysis = updatePeakAnalysis;
// sortAnalysisTable moved to analysis_ui.js
// renderAnalysisTable moved to analysis_ui.js
// showPeakDistributions moved to analysis_ui.js
window.runThresholdDetection = runThresholdDetection;
window.runProminenceDetection = runProminenceDetection;
window.setCallbacks = setCallbacks;
window.expandPeaksToBaseline = expandPeaksToBaseline;
window.analysisData = window.analysisData || [];
