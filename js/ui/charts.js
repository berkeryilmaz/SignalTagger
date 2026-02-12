// Chart Drawing

function draw(preserveWindow = false) {
    if (!state.signal || state.signal.length === 0) return;

    let totalPoints = state.signal.length;
    let ws = state.windowSize;
    let st = state.windowStart;

    if (!preserveWindow) {
        let maxStart = totalPoints - ws;
        if (maxStart < 0) maxStart = 0;
        if (st > maxStart) st = maxStart;
        if (st < 0) st = 0;
        state.windowStart = st;
        updateSliderMax();
    }

    let startIdx = state.windowStart;
    let endIdx = Math.min(startIdx + ws, totalPoints);

    let chartData = [];
    let derivData = [];
    let smoothData = [];
    let smoothDerivData = [];
    let base = state.isBaselineEnabled ? state.baselineValue : 0;

    for (let i = startIdx; i < endIdx; i++) {
        chartData.push(state.signal[i]);
        if (state.showDerivative && state.rawDerivativeSignal) {
            derivData.push(state.rawDerivativeSignal[i]);
        }
        if (state.isSmoothEnabled && state.smoothedSignal) {
            smoothData.push(state.smoothedSignal[i]);
            if (state.showDerivative && state.smoothDerivativeSignal) {
                smoothDerivData.push(state.smoothDerivativeSignal[i]);
            }
        }
    }

    const tc = getThemeColors();

    let seriesList = [];

    state.referenceSignals.forEach((ref, idx) => {
        let refSlice = [];
        for (let i = startIdx; i < endIdx; i++) {
            if (i < ref.data.length) refSlice.push(ref.data[i]); else refSlice.push(0);
        }
        seriesList.push({
            name: ref.name,
            data: refSlice,
            color: ref.color || '#9e9e9e',
            lineWidth: 1,
            dashStyle: 'Dash',
            opacity: 0.7,
            enableMouseTracking: false
        });
    });

    seriesList.push({
        name: state.isSmoothEnabled ? 'Raw' : 'Signal',
        data: chartData,
        color: state.isSmoothEnabled ? '#ccc' : tc.accentColor || '#00bcd4',
        lineWidth: state.isSmoothEnabled ? 1 : 2,
        opacity: state.isSmoothEnabled ? 0.5 : 1,
        zIndex: 2
    });

    if (state.isSmoothEnabled) {
        seriesList.push({
            name: 'Smoothed',
            data: smoothData,
            color: tc.smoothColor,
            lineWidth: 2,
            zIndex: 3
        });
    }

    let yPlotLines = [];
    if (state.isBaselineEnabled) {
        yPlotLines.push({
            value: base,
            color: '#ffeb3b',
            width: 2,
            dashStyle: 'ShortDot',
            label: { text: `Base: ${base}`, style: { color: '#ffeb3b' } },
            zIndex: 5
        });
    }

    let plotBands = [];
    let currentBandStart = -1;
    let currentBandType = 0;

    // Safety check for labels
    if (state.labels) {
        for (let i = startIdx; i < endIdx; i++) {
            let l = state.labels[i];
            if (l !== currentBandType) {
                if (currentBandType !== 0 && currentBandStart !== -1) {
                    plotBands.push({
                        from: currentBandStart - startIdx,
                        to: i - startIdx - 1,
                        color: state.labelTypes[currentBandType].color,
                        className: `label-band-${currentBandType}`
                    });
                }
                currentBandStart = i;
                currentBandType = l;
            }
        }
        if (currentBandType !== 0 && currentBandStart !== -1) {
            plotBands.push({
                from: currentBandStart - startIdx,
                to: endIdx - 1 - startIdx,
                color: state.labelTypes[currentBandType].color
            });
        }
    }

    plotBands.forEach(pb => {
        if (Highcharts.color) pb.color = Highcharts.color(pb.color).setOpacity(0.2).get();
    });

    Highcharts.chart('chart', {
        chart: {
            type: 'line',
            backgroundColor: tc.plotBg,
            animation: false,
            zooming: { type: 'x' },
            events: {
                selection: function (e) {
                    if (e.xAxis) {
                        if (window.markRange) {
                            window.markRange(Math.floor(e.xAxis[0].min) + startIdx, Math.floor(e.xAxis[0].max) + startIdx);
                        }
                        e.preventDefault();
                    }
                }
            }
        },
        title: { text: undefined },
        boost: { useGPUTranslations: true, usePreallocated: true },
        xAxis: {
            categories: Array.from({ length: endIdx - startIdx }, (_, i) => startIdx + i),
            min: 0,
            max: endIdx - startIdx - 1,
            labels: {
                formatter: function () { return this.value + startIdx; },
                style: { color: tc.textMuted }
            },
            gridLineColor: tc.grid,
            lineColor: tc.axisLine,
            tickColor: tc.axisLine,
            plotBands: plotBands
        },
        yAxis: {
            title: { text: 'Voltage', style: { color: tc.textMuted } },
            gridLineColor: tc.grid,
            plotLines: yPlotLines,
            labels: { style: { color: tc.textMuted } },
            min: state.globalMin,
            max: state.globalMax
        },
        legend: { enabled: true, itemStyle: { color: tc.text } },
        tooltip: {
            backgroundColor: tc.tooltipBg,
            style: { color: tc.tooltipText },
            shared: true,
            crosshairs: true,
            formatter: function () {
                let idx = this.x + startIdx;
                let s = `<b>Index: ${idx}</b>`;
                this.points.forEach(p => {
                    s += `<br/><span style="color:${p.color}">\u25CF</span> ${p.series.name}: <b>${roundToPrecision(p.y)}</b>`;
                });
                let l = state.labels && state.labels[idx];
                if (l && l !== 0) s += `<br/>Label: ${state.labelTypes[l].name}`;
                return s;
            }
        },
        plotOptions: {
            line: { marker: { enabled: false }, animation: false, states: { hover: { enabled: false } } },
            series: { stickyTracking: false }
        },
        series: seriesList,
        credits: { enabled: false }
    });

    if (state.showDerivative && document.getElementById("derivative-chart").style.display !== 'none') {
        let derivSeries = [];
        derivSeries.push({ name: 'Raw d/dx', type: 'line', data: derivData, lineWidth: 1, color: tc.derivColor, opacity: 0.5, zIndex: 1 });
        if (state.isSmoothEnabled) {
            derivSeries.push({ name: 'Smooth d/dx', type: 'line', data: smoothDerivData, lineWidth: 2, color: tc.smoothColor, zIndex: 3 });
        }

        Highcharts.chart('derivative-chart', {
            chart: { type: 'line', backgroundColor: tc.plotBg, animation: false },
            title: { text: undefined },
            boost: { useGPUTranslations: true },
            xAxis: {
                min: 0, max: endIdx - startIdx - 1,
                labels: { enabled: false },
                gridLineColor: tc.grid
            },
            yAxis: {
                title: { text: 'd/dx', style: { color: tc.textMuted } },
                gridLineColor: tc.grid,
                labels: { style: { color: tc.textMuted } },
                plotLines: [{ value: 0, color: tc.axisLine, width: 1, zIndex: 2 }]
            },
            legend: { enabled: true, itemStyle: { color: tc.text } },
            tooltip: { shared: true, backgroundColor: tc.tooltipBg, style: { color: tc.tooltipText } },
            plotOptions: { line: { marker: { enabled: false }, animation: false } },
            series: derivSeries,
            credits: { enabled: false }
        });
    }

    updateStatus();
}

function updateStatus() {
    let ws = state.windowSize;
    let st = state.windowStart;
    let end = Math.min(st + ws, state.signal.length);
    if (document.getElementById("window-status"))
        document.getElementById("window-status").textContent = `Window: ${st} - ${end - 1}`;
}

function updateSliderMax() {
    if (!state.signal) return;
    const max = Math.max(0, state.signal.length - state.windowSize);
    const slider = document.getElementById("timeSlider");
    if (slider) {
        slider.max = max;
        slider.value = state.windowStart;
    }
}

function toggleDerivative() {
    state.showDerivative = !state.showDerivative;
    const btn = document.getElementById("derivToggleBtn");
    const derivDiv = document.getElementById("derivative-chart");
    const container = document.getElementById("chart-container");

    if (state.showDerivative) {
        btn.classList.add("active-toggle");
        derivDiv.style.display = "block";
        container.classList.add("split-view");
    } else {
        btn.classList.remove("active-toggle");
        derivDiv.style.display = "none";
        container.classList.remove("split-view");
    }

    window.dispatchEvent(new Event('resize'));
    draw(true);
}

window.draw = draw;
window.updateSliderMax = updateSliderMax;
window.toggleDerivative = toggleDerivative;
