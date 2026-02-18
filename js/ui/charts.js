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
            gridLineWidth: 1,
            gridLineColor: tc.grid,
            lineColor: tc.axisLine,
            tickColor: tc.axisLine,
            plotBands: plotBands,
            tickInterval: undefined,
            startOnTick: true,
            endOnTick: true
        },
        yAxis: {
            title: { text: 'Voltage', style: { color: tc.textMuted } },
            gridLineWidth: 1,
            gridLineColor: tc.grid,
            plotLines: yPlotLines,
            labels: { style: { color: tc.textMuted } },
            min: state.globalMin,
            max: state.globalMax,
            tickInterval: undefined
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

// Ensure draw calls scope update
const originalDraw = draw;
window.draw = function (preserveWindow) {
    originalDraw(preserveWindow);
    if (window.drawScopeScreen) window.drawScopeScreen();
};

// Dedicated Scope Screen
function drawScopeScreen() {
    // Only draw if modal is open
    const modal = document.getElementById("scopeScreenModal");
    if (!modal || modal.style.display === "none") return;

    if (!state.signal || state.signal.length === 0) return;
    if (!state.scopeMetadata) return; // Need metadata for true replication

    const meta = state.scopeMetadata;
    // Assuming single channel or active channel from loader logic. 
    // We need to find the active channel config to get scale/offset.
    // In loader we merged setups. Let's look at the first active channel in meta.
    let activeCh = meta.channel.find(c => c.display === 'ON') || meta.channel[0];

    // Calculate Voltage Ranges for -2048 and 2047 raw values
    // Formula: (5 * value / 2000 - offset * 2 / 100) * scale * probe
    // We can use the helper from binLoader if exposed, or re-implement.
    // Let's re-implement for simplicity and independence.
    const parseVolts = (str) => {
        let v = parseFloat(str);
        if (str.includes('mV')) v /= 1000;
        return v;
    };

    const scale = parseVolts(activeCh.scale);
    const probe = parseFloat(activeCh.probe.replace('x', '')) || 1;
    const offsetRaw = parseFloat(activeCh.offset) || 0; // The string might be "0.00V"

    // The offset in original python code was used in the formula:
    // val = (5 * raw / 2000 - offset * 2 / 100) * scale * probe
    // Actually looking at bin_loader.js: 
    // offsetStr = parseFloat(channel.offset) || 0;
    // num = (value * factor - offsetStr) * totalMult; 
    // where factor = 5 / 2000 = 0.0025
    // and totalMult = scale * probe (if offset is already in "units" before mult?)
    // Wait, bin_loader says: 
    // const num = (value * (5/2000) - (offset * 2 / 100)) * scale * probe;

    const rawToVolt = (raw) => {
        return (raw * 0.0025 - (offsetRaw * 0.02)) * scale * probe;
    };

    const minVolt = rawToVolt(-2048);
    const maxVolt = rawToVolt(2047);

    // Update OSD
    document.getElementById("osd-tl").textContent = `CH1: ${activeCh.scale}`;
    document.getElementById("osd-bl").textContent = `Offset: ${activeCh.offset}`;

    // Timebase
    // We want to show exactly 15.2 divisions.
    // The total window size covers these 15.2 divisions.
    // Center is at windowSize / 2.
    // 1 division = windowSize / 15.2.
    const divWidth = state.windowSize / 15.2;
    const xCenter = (state.windowSize - 1) / 2;

    let startIdx = state.windowStart;
    let endIdx = Math.min(startIdx + state.windowSize, state.signal.length);
    let dataSlice = [];
    for (let i = startIdx; i < endIdx; i++) dataSlice.push(state.signal[i]);

    // Padding data if near end of file to keep window constant
    while (dataSlice.length < state.windowSize) {
        dataSlice.push(null); // or 0, or just let it cut off? Null for gaps.
    }

    // Update Time OSD
    if (meta.timebase) {
        document.getElementById("osd-br").textContent = `Time: ${meta.timebase.scale}`;
    }
    document.getElementById("osd-tr").textContent = `${dataSlice.length} pts`;

    // Calculate Y Center (0 Volts usually, or midpoint of range)
    // The user wants range [-2048, 2047].
    // Midpoint of raw range is -0.5 (approx 0).
    const yCenter = (minVolt + maxVolt) / 2;

    // Generate precise tick positions
    // Y-Axis: 11 ticks for 10 divisions
    const yTicks = [];
    const yStep = (maxVolt - minVolt) / 10;
    for (let i = 0; i <= 10; i++) {
        yTicks.push(minVolt + i * yStep);
    }

    // X-Axis: Ticks at integer divisions relative to center
    // Range is -7.6 to +7.6
    // We want ticks at -7, -6, ..., 0, ..., 6, 7.
    // Each integer div width = divWidth (samples).
    const xTicks = [];
    for (let d = -7; d <= 7; d++) {
        xTicks.push(xCenter + d * divWidth);
    }

    Highcharts.chart('scopeScreenChart', {
        chart: {
            type: 'line',
            backgroundColor: '#000000', // Authentic black
            animation: false,
            margin: [25, 30, 25, 40] // Adjusted margins for labels
        },
        title: { text: undefined },
        boost: { useGPUTranslations: true, usePreallocated: true },
        xAxis: {
            min: 0,
            max: state.windowSize, // Allow full 15.2 width
            gridLineWidth: 1,
            gridLineColor: '#333',
            tickPositions: xTicks,
            labels: {
                enabled: true,
                style: { color: '#0f0', fontSize: '10px' },
                formatter: function () {
                    // Convert index to div relative to center
                    const divVal = (this.value - xCenter) / divWidth;
                    // Round to nearest integer for clean display
                    return Math.round(divVal).toFixed(0);
                },
                y: 15 // push labels down slightly
            },
            tickLength: 5,
            tickColor: '#333',
            lineWidth: 0,
            // Center Line
            plotLines: [{
                value: xCenter,
                color: '#666', // Brighter center line
                width: 2,
                zIndex: 2
            }]
        },
        yAxis: {
            min: minVolt,
            max: maxVolt,
            gridLineWidth: 1,
            gridLineColor: '#333',
            tickPositions: yTicks, // Force exact ticks
            title: { text: undefined },
            labels: { enabled: false },
            // Center Line (Vertical 0 usually)
            plotLines: [{
                value: yCenter,
                color: '#666', // Brighter center line
                width: 2,
                zIndex: 2
            }]
        },
        legend: { enabled: false },
        tooltip: { enabled: false },
        plotOptions: {
            line: {
                marker: { enabled: false },
                lineWidth: 2,
                color: '#00ff00', // Classic Green Scope
                animation: false,
                states: { hover: { enabled: false } }
            },
            series: { stickyTracking: false }
        },
        series: [{
            data: dataSlice,
            zIndex: 3
        }],
        credits: { enabled: false }
    });
}

window.draw = draw;
window.drawScopeScreen = drawScopeScreen;
window.updateSliderMax = updateSliderMax;
window.toggleDerivative = toggleDerivative;
