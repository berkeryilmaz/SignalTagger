// Analysis: Histogram with Robust Gaussian Fitting (Levenberg-Marquardt) & Auto-Binning

// Levenberg-Marquardt Solver for Gaussian Fit
function solve3x3(A, b) {
    let det = A[0][0] * (A[1][1] * A[2][2] - A[2][1] * A[1][2]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (Math.abs(det) < 1e-12) return null;
    let invDet = 1 / det;
    let x = [0, 0, 0];
    let d0 = b[0] * (A[1][1] * A[2][2] - A[2][1] * A[1][2]) - A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2]) + A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2]);
    let d1 = A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2]) - b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0]);
    let d2 = A[0][0] * (A[1][1] * b[2] - A[2][1] * b[1]) - A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0]) + b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    x[0] = d0 * invDet; x[1] = d1 * invDet; x[2] = d2 * invDet;
    return x;
}

function fitGaussianLM(xData, yData, initialParams) {
    let params = [...initialParams]; // [A, mu, sigma]
    let nPoints = xData.length;
    let lambda = 0.01;
    const maxIter = 50;
    const tolerance = 1e-5;

    for (let iter = 0; iter < maxIter; iter++) {
        let A = params[0], mu = params[1], sigma = params[2];
        let sigma2 = sigma * sigma;
        let sigma3 = sigma2 * sigma;

        let J = [], r = [], errSumSq = 0;

        for (let i = 0; i < nPoints; i++) {
            let x = xData[i], y = yData[i];
            let z = (x - mu) * (x - mu) / (2 * sigma2);
            let expZ = Math.exp(-z);
            let modelY = A * expZ;
            let diff = y - modelY;
            r.push(diff);
            errSumSq += diff * diff;

            let d_A = expZ;
            let d_mu = modelY * (x - mu) / sigma2;
            let d_sigma = modelY * ((x - mu) * (x - mu)) / sigma3;
            J.push([d_A, d_mu, d_sigma]);
        }

        let JTr = [0, 0, 0];
        for (let i = 0; i < nPoints; i++) {
            JTr[0] += J[i][0] * r[i]; JTr[1] += J[i][1] * r[i]; JTr[2] += J[i][2] * r[i];
        }

        let JTJ = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < nPoints; i++) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    JTJ[row][col] += J[i][row] * J[i][col];
                }
            }
        }

        let A_aug = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                A_aug[row][col] = JTJ[row][col];
                if (row === col) A_aug[row][col] *= (1 + lambda);
            }
        }

        let delta = solve3x3(A_aug, JTr);
        if (!delta) break;

        let newParams = [params[0] + delta[0], params[1] + delta[1], params[2] + delta[2]];
        let newErrSumSq = 0;
        for (let i = 0; i < nPoints; i++) {
            let x = xData[i], y = yData[i];
            let A_ = newParams[0], mu_ = newParams[1], sigma_ = newParams[2];
            let modelY_ = A_ * Math.exp(-((x - mu_) * (x - mu_)) / (2 * sigma_ * sigma_));
            newErrSumSq += (y - modelY_) * (y - modelY_);
        }

        if (newErrSumSq < errSumSq) {
            lambda /= 10; params = newParams;
            if (Math.abs(newErrSumSq - errSumSq) < tolerance) break;
        } else {
            lambda *= 10;
        }
    }
    return { A: params[0], mu: params[1], sigma: Math.abs(params[2]) };
}

// Freedman-Diaconis Rule for Auto-Binning
function calculateOptimalBins(data) {
    if (data.length < 2) return 10;

    // Use a sampled approach for large datasets to avoid sorting huge arrays
    let sample = data;
    if (data.length > 10000) {
        sample = [];
        let step = Math.floor(data.length / 10000);
        for (let i = 0; i < data.length; i += step) sample.push(data[i]);
    }

    let sorted = [...sample].sort((a, b) => a - b);
    let n = sorted.length;
    let min = sorted[0];
    let max = sorted[n - 1];
    let range = max - min;

    let q1 = sorted[Math.floor(n * 0.25)];
    let q3 = sorted[Math.floor(n * 0.75)];
    let iqr = q3 - q1;

    if (range === 0) return 1;
    if (iqr === 0) return Math.ceil(Math.sqrt(n));

    let binWidth = 2 * iqr * Math.pow(n, -1 / 3);
    if (binWidth === 0) binWidth = range / 50;

    let bins = Math.ceil(range / binWidth);

    return Math.max(5, Math.min(bins, 200)); // Clamp between 5 and 200
}

function runHistogramAnalysis(autoBins = false) {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    openModal('histoModal');

    const scope = document.querySelector('input[name="histoScope"]:checked').value;

    // Collect Data
    const dataArr = [];
    let start = (scope === 'full') ? 0 : state.windowStart;
    let end = (scope === 'full') ? state.signal.length : Math.min(state.windowStart + state.windowSize, state.signal.length);
    const src = state.isSmoothEnabled ? state.smoothedSignal : state.signal;

    // Use full precision data (no downsampling for histogram if possible, or very light)
    // The previous implementation downsampled heavily. Let's try to keep resolution but maybe skip if HUGE.
    let step = 1;
    if (end - start > 2000000) step = Math.floor((end - start) / 2000000);

    for (let i = start; i < end; i += step) {
        dataArr.push(src[i]);
    }

    if (dataArr.length < 2) return;

    // Basic Stats
    let sum = 0; for (let v of dataArr) sum += v;
    let mean = sum / dataArr.length;
    let sumSqDiff = 0; for (let v of dataArr) sumSqDiff += Math.pow(v - mean, 2);
    let sigma = Math.sqrt(sumSqDiff / dataArr.length);

    // Auto Binning
    if (autoBins) {
        let optimalBins = calculateOptimalBins(dataArr);
        document.getElementById("histoBins").value = optimalBins;
    }
    const numBins = parseInt(document.getElementById("histoBins").value) || 100;

    // Binning
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let v of dataArr) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
    }

    let range = maxVal - minVal; if (range === 0) range = 1;
    // Add slightly padding to avoid boundary issues
    minVal -= range * 0.02; maxVal += range * 0.02;
    let binWidth = (maxVal - minVal) / numBins;

    let bins = new Array(numBins).fill(0);
    for (let v of dataArr) {
        let idx = Math.floor((v - minVal) / binWidth);
        if (idx >= numBins) idx = numBins - 1;
        if (idx < 0) idx = 0;
        bins[idx]++;
    }

    let histoData = [];
    let fitX = [], fitY = [];
    let maxCount = 0, maxBinIdx = 0;

    for (let i = 0; i < numBins; i++) {
        let center = minVal + (i + 0.5) * binWidth;
        let count = bins[i];
        histoData.push([center, count]);
        if (count > maxCount) { maxCount = count; maxBinIdx = i; }

        if (count > 0) {
            fitX.push(center);
            fitY.push(count);
        }
    }

    // Levenberg-Marquardt Fit
    // Initial guesses: Amp = maxCount, Mean = peak center, Sigma = standard deviation * 0.5 (guess)
    let peakCenter = minVal + (maxBinIdx + 0.5) * binWidth;
    let initParams = [maxCount, peakCenter, sigma * 0.5];

    let result = fitGaussianLM(fitX, fitY, initParams);

    let fittedMean = result.mu;
    let fittedSigma = result.sigma;
    let fittedAmp = result.A;

    updateState({ currentGaussianMean: fittedMean, currentHistoData: histoData }); // Store histoData? Maybe just redraw.

    let prec = (state.dataPrecision !== undefined) ? state.dataPrecision + 2 : 5;
    document.getElementById("statMean").textContent = fittedMean.toFixed(prec);
    document.getElementById("statSigma").textContent = fittedSigma.toFixed(prec);

    // Generate Gaussian Curve Points
    let gaussSeriesData = [];
    let gMin = fittedMean - 4 * fittedSigma;
    let gMax = fittedMean + 4 * fittedSigma;
    let gStep = (gMax - gMin) / 100;

    for (let x = gMin; x <= gMax; x += gStep) {
        let y = fittedAmp * Math.exp(-Math.pow(x - fittedMean, 2) / (2 * fittedSigma * fittedSigma));
        gaussSeriesData.push([x, y]);
    }

    updateHistoChartUI(histoData, gaussSeriesData);
}

function updateHistoChartUI(histoData, gaussData) {
    if (!histoData || histoData.length === 0) return;
    const tc = getThemeColors();
    const useLog = document.getElementById("histoLogScale").checked;
    // We already have computed bins in histoData (center, count)
    // Highcharts Histogram type expects raw data usually, BUT we can simply use 'column' type 
    // since we manually binned it. This is more robust and faster for huge datasets.

    Highcharts.chart('histoChart', {
        chart: {
            marginTop: 20,
            backgroundColor: tc.bg,
            style: { fontFamily: 'Inter' },
            type: 'column' // Use column since we manually binned
        },
        title: { text: null },
        legend: { enabled: false },
        credits: { enabled: false },
        boost: { useGPUTranslations: true },
        xAxis: {
            title: { text: 'Voltage', style: { color: tc.textMuted } },
            lineColor: tc.axisLine,
            labels: { style: { color: tc.textMuted } },
            gridLineColor: tc.grid
        },
        yAxis: {
            title: { text: 'Count', style: { color: tc.textMuted } },
            type: useLog ? 'logarithmic' : 'linear',
            gridLineColor: tc.grid,
            labels: { style: { color: tc.textMuted } }
        },
        plotOptions: {
            column: {
                pointPadding: 0,
                borderWidth: 0,
                groupPadding: 0,
                shadow: false,
                color: tc.histoColor || '#7c4dff'
            },
            spline: { marker: { enabled: false } }
        },
        series: [{
            name: 'Histogram',
            data: histoData,
            zIndex: 1
        }, {
            name: 'Gaussian Fit (LM)',
            type: 'spline',
            data: gaussData,
            color: '#00e676', // Green fit
            lineWidth: 2,
            zIndex: 2,
            enableMouseTracking: false
        }]
    });
}


function createDistributionChart(containerId, dataArray, title, xTitle, color, binCount) {
    const tc = getThemeColors();
    let kdeResult = calculateKDE(dataArray, binCount);
    let densityData = kdeResult.points;

    Highcharts.chart(containerId, {
        chart: {
            backgroundColor: tc.bg,
            height: 350,
            marginBottom: 60, // Ensure space for X-axis labels
            zoomType: 'x',
            panning: true,
            panKey: 'shift'
        },
        title: { text: null },
        credits: { enabled: false },
        legend: {
            enabled: true,
            itemStyle: { color: tc.textMuted },
            itemHoverStyle: { color: tc.text },
            align: 'right',
            verticalAlign: 'top',
            layout: 'vertical',
            floating: true,
            x: -10,
            y: 35 // Adjusted slightly
        },
        xAxis: {
            title: { text: xTitle, style: { color: tc.textMuted } },
            lineColor: tc.axisLine,
            labels: { style: { color: tc.textMuted } }
        },
        yAxis: [{
            title: { text: 'Count', style: { color: color } },
            gridLineColor: tc.grid,
            labels: { style: { color: tc.textMuted } }
        }, {
            title: { text: 'Density', style: { color: tc.text } },
            opposite: true,
            gridLineWidth: 0,
            labels: { enabled: false }
        }],
        series: [{
            name: 'Histogram',
            type: 'histogram',
            baseSeries: 'raw_data',
            color: color,
            binsNumber: binCount,
            zIndex: 1,
            yAxis: 0,
            showInLegend: true
        }, {
            name: 'Data',
            type: 'scatter',
            data: dataArray,
            id: 'raw_data',
            visible: false,
            showInLegend: false
        }, {
            name: 'Density Fit (KDE)',
            type: 'spline',
            data: densityData,
            yAxis: 1,
            color: tc.text,
            zIndex: 2,
            marker: { enabled: false },
            showInLegend: true
        }]
    });
}

function calculateKDE(data, binCount) {
    if (data.length < 2) return { points: [], bandwidth: 1 };

    let min = Math.min(...data);
    let max = Math.max(...data);
    let range = max - min;
    if (range === 0) range = 1;

    let binWidth = range / binCount;
    let bandwidth = binWidth * 1.5;

    let step = range / 100;
    let kdePoints = [];

    for (let x = min - range * 0.1; x <= max + range * 0.1; x += step) {
        let sumK = 0;
        for (let i = 0; i < data.length; i++) {
            let u = (x - data[i]) / bandwidth;
            let k = (Math.abs(u) <= 1) ? 0.75 * (1 - u * u) : 0; // Epanechnikov kernel
            sumK += k;
        }
        let density = sumK / (data.length * bandwidth);
        kdePoints.push([x, density]);
    }
    return { points: kdePoints, bandwidth };
}

function applyBaselineFromMean() {
    if (state.currentGaussianMean === undefined) return;

    if (!state.isBaselineEnabled) {
        updateState({ isBaselineEnabled: true });
        if (elements.baselineToggle) elements.baselineToggle.checked = true;
        if (elements.baselineInput) elements.baselineInput.disabled = false;
    }

    let val = state.currentGaussianMean; // Use exact mean, logic elsewhere handles rounding for display if needed
    updateState({ baselineValue: val });

    // Update Input with rounded value
    if (elements.baselineInput) {
        let prec = (state.dataPrecision !== undefined) ? state.dataPrecision + 2 : 5;
        elements.baselineInput.value = val.toFixed(prec);
    }

    // Trigger Recalc/Draw
    // logic in main (align or just draw?). v10 just calls draw(false).
    // But we might need recalculating filters if baseline is subtracted pre-filter? 
    // In v10, baseline is subtracted in draw or data access? 
    // In main.js: alignBaselineToZero does subtraction? No, align modifies data. 
    // The baseline feature in v10 (and here) seems to be a visual offset or strictly subtraction?
    // Let's check main.js updatePrecision: `if (state.isBaselineEnabled) ... elements.baselineInput.value = ...`
    // It seems baseline is active in `draw` or `recalcFilters`.
    // Let's assume `recalcFilters` or `draw` picks it up.
    if (window.recalcFilters) window.recalcFilters();
    if (window.draw) window.draw();

    // Visual Feedback
    // Find the button that likely triggered this
    let btn = document.querySelector("#histoModal .modal-btn[onclick*='applyBaselineFromMean']");
    if (btn) {
        let originalBg = btn.style.backgroundColor;
        btn.style.backgroundColor = "rgba(0,230,118,0.5)";
        btn.textContent = "Baseline Set!";
        setTimeout(() => {
            btn.style.backgroundColor = originalBg;
            btn.textContent = "Set Baseline to Fitted Mean (μ)";
        }, 1000);
    }
}

// Helper to update chart on settings change (without re-calculating bins for log scale toggle)
function updateHistoChart() {
    // If we just want to update chart style (log/linear), strictly speaking we could re-use data.
    // But simplified: just re-run without auto-binning.
    runHistogramAnalysis(false);
}

window.runHistogramAnalysis = runHistogramAnalysis;
window.updateHistoChartUI = updateHistoChartUI; // Maybe not needed globally if runHistogramAnalysis calls it? But useful for debugging.
window.createDistributionChart = createDistributionChart;
window.applyBaselineFromMean = applyBaselineFromMean;
window.updateHistoChart = updateHistoChart;
window.calculateOptimalBins = calculateOptimalBins;
