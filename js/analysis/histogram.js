/**
 * Histogram Analizi & Görselleştirme
 * ====================================
 *
 * Bu modül, sinyal verisinin histogram analizini ve Gaussian fit
 * görselleştirmesini sağlar. İstatistiksel hesaplamalar (LM fit,
 * KDE, optimal binning) statistics.js'den çağrılır.
 *
 * Akış:
 *   1. Veri toplanır (pencere veya tam sinyal)
 *   2. Temel istatistikler hesaplanır (ortalama, standart sapma)
 *   3. Binleme yapılır (manuel veya Freedman-Diaconis)
 *   4. Gaussian fit uygulanır (Levenberg-Marquardt, statistics.js)
 *   5. Histogram ve fit eğrisi çizilir (Highcharts)
 */

function runHistogramAnalysis(autoBins = false) {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    openModal('histoModal');

    const scope = document.querySelector('input[name="histoScope"]:checked').value;

    // Veri toplama
    const dataArr = [];
    let start = (scope === 'full') ? 0 : state.windowStart;
    let end = (scope === 'full') ? state.signal.length : Math.min(state.windowStart + state.windowSize, state.signal.length);
    const src = state.isSmoothEnabled ? state.smoothedSignal : state.signal;

    let step = 1;
    if (end - start > 2000000) step = Math.floor((end - start) / 2000000);

    for (let i = start; i < end; i += step) {
        dataArr.push(src[i]);
    }

    if (dataArr.length < 2) return;

    // Temel istatistikler
    let sum = 0; for (let v of dataArr) sum += v;
    let mean = sum / dataArr.length;
    let sumSqDiff = 0; for (let v of dataArr) sumSqDiff += Math.pow(v - mean, 2);
    let sigma = Math.sqrt(sumSqDiff / dataArr.length);

    // Otomatik bin sayısı (Freedman-Diaconis, statistics.js)
    if (autoBins) {
        let optimalBins = calculateOptimalBins(dataArr);
        document.getElementById("histoBins").value = optimalBins;
    }
    const numBins = parseInt(document.getElementById("histoBins").value) || 100;

    // Binleme
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let v of dataArr) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
    }

    let range = maxVal - minVal; if (range === 0) range = 1;
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

    // Gaussian Fit (Levenberg-Marquardt, statistics.js)
    let peakCenter = minVal + (maxBinIdx + 0.5) * binWidth;
    let initParams = [maxCount, peakCenter, sigma * 0.5];

    let result = fitGaussianLM(fitX, fitY, initParams);

    let fittedMean = result.mu;
    let fittedSigma = result.sigma;
    let fittedAmp = result.A;

    updateState({ currentGaussianMean: fittedMean, currentHistoData: histoData });

    let prec = (state.dataPrecision !== undefined) ? state.dataPrecision + 2 : 5;
    document.getElementById("statMean").textContent = fittedMean.toFixed(prec);
    document.getElementById("statSigma").textContent = fittedSigma.toFixed(prec);

    // Gaussian eğri noktaları
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

    Highcharts.chart('histoChart', {
        chart: {
            marginTop: 20,
            backgroundColor: tc.bg,
            style: { fontFamily: 'Inter' },
            type: 'column'
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
            color: '#00e676',
            lineWidth: 2,
            zIndex: 2,
            enableMouseTracking: false
        }]
    });
}

/**
 * Dağılım grafiği oluşturur (KDE + Histogram).
 * statistics.js'deki calculateKDE() ve calculateOptimalBins() kullanılır.
 */
function createDistributionChart(containerId, dataArray, title, xTitle, color, binCount, chartType) {
    const tc = getThemeColors();
    let kdeResult = calculateKDE(dataArray, binCount);
    let densityData = kdeResult.points;
    const originalData = dataArray;

    Highcharts.chart(containerId, {
        chart: {
            backgroundColor: tc.bg,
            height: 350,
            marginBottom: 60,
            zoomType: 'x',
            panning: true,
            panKey: 'shift',
            alignTicks: false
        },
        boost: { enabled: false },
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
            y: 35
        },
        xAxis: {
            title: { text: xTitle, style: { color: tc.textMuted } },
            lineColor: tc.axisLine,
            labels: { style: { color: tc.textMuted } },
            events: {
                afterSetExtremes: function (e) {
                    const chart = this.chart;

                    if (e.min == null || e.max == null) {
                        if (chartType && window.updateSingleDistChart) {
                            setTimeout(() => {
                                window.updateSingleDistChart(chartType);
                            }, 0);
                        }
                        return;
                    }

                    let currentData = originalData.filter(v => v >= e.min && v <= e.max);

                    if (currentData.length < 2) return;
                    let dMin = e.min;
                    let dMax = e.max;
                    if (dMax <= dMin) return;

                    const histSeries = chart.get('series_hist');
                    const rawSeries = chart.get('series_raw');
                    const kdeSeries = chart.get('series_kde');

                    if (!rawSeries) return;

                    let newBinCount = calculateOptimalBins(currentData);

                    if (chartType) {
                        const inputMap = {
                            'width': 'binsWidth', 'fwhm': 'binsFWHM',
                            'voltage': 'binsVoltage', 'area': 'binsArea',
                            'sumVSq': 'binsSumVSq', 'charge': 'binsCharge',
                            'energy': 'binsEnergy', 'energyEV': 'binsEnergyEV'
                        };
                        const inputId = inputMap[chartType];
                        if (inputId) {
                            const el = document.getElementById(inputId);
                            if (el) el.value = newBinCount;
                        }
                    }

                    rawSeries.setData(currentData, false);

                    if (kdeSeries && kdeSeries.visible) {
                        let newKde = calculateKDE(currentData, newBinCount);
                        kdeSeries.setData(newKde.points, false);
                    }

                    if (histSeries && histSeries.options.binsNumber !== newBinCount) {
                        histSeries.update({ binsNumber: newBinCount }, false);
                    }

                    chart.redraw();
                }
            }
        },
        yAxis: [{
            title: { text: 'Count', style: { color: color } },
            gridLineColor: tc.grid,
            labels: { style: { color: tc.textMuted } },
            allowDecimals: false,
            min: 0
        }, {
            title: { text: 'Density', style: { color: tc.text } },
            opposite: true,
            gridLineWidth: 0,
            labels: { enabled: false },
            min: 0
        }],
        series: [{
            name: 'Histogram',
            type: 'histogram',
            baseSeries: 'series_raw',
            id: 'series_hist',
            color: color,
            binsNumber: binCount,
            zIndex: 1,
            yAxis: 0,
            showInLegend: true
        }, {
            name: 'Data',
            type: 'scatter',
            data: dataArray,
            id: 'series_raw',
            visible: false,
            showInLegend: false
        }, {
            name: 'Density Fit (KDE)',
            type: 'spline',
            data: densityData,
            id: 'series_kde',
            yAxis: 1,
            color: tc.text,
            zIndex: 2,
            marker: { enabled: false },
            showInLegend: true
        }]
    });
}

function applyBaselineFromMean() {
    if (state.currentGaussianMean === undefined) return;

    if (!state.isBaselineEnabled) {
        updateState({ isBaselineEnabled: true });
        if (elements.baselineToggle) elements.baselineToggle.checked = true;
        if (elements.baselineInput) elements.baselineInput.disabled = false;
    }

    let val = state.currentGaussianMean;
    updateState({ baselineValue: val });

    if (elements.baselineInput) {
        let prec = (state.dataPrecision !== undefined) ? state.dataPrecision + 2 : 5;
        elements.baselineInput.value = val.toFixed(prec);
    }

    if (window.recalcFilters) window.recalcFilters();
    if (window.draw) window.draw();

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

function updateHistoChart() {
    runHistogramAnalysis(false);
}

window.runHistogramAnalysis = runHistogramAnalysis;
window.updateHistoChartUI = updateHistoChartUI;
window.createDistributionChart = createDistributionChart;
window.applyBaselineFromMean = applyBaselineFromMean;
window.updateHistoChart = updateHistoChart;
