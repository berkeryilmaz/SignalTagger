// UI: Scope Screen — Osiloskop Ekranı Çizimi
// Dedicated scope screen modal için Highcharts çizimini yönetir.

function drawScopeScreen() {
    const modal = document.getElementById("scopeScreenModal");
    if (!modal || modal.style.display === "none") return;

    if (!state.signal || state.signal.length === 0) return;
    if (!state.scopeMetadata) return;

    const meta = state.scopeMetadata;
    let activeCh = meta.channel.find(c => c.display === 'ON') || meta.channel[0];

    // Ham-Gerilim dönüşüm fonksiyonu
    const parseVolts = (str) => {
        let v = parseFloat(str);
        if (str.includes('mV')) v /= 1000;
        return v;
    };

    const scale = parseVolts(activeCh.scale);
    const probe = parseFloat(activeCh.probe.replace('x', '')) || 1;
    const offsetRaw = parseFloat(activeCh.offset) || 0;

    const rawToVolt = (raw) => {
        return (raw * 0.0025 - (offsetRaw * 0.02)) * scale * probe;
    };

    const minVolt = rawToVolt(-2048);
    const maxVolt = rawToVolt(2047);

    // OSD güncelle
    document.getElementById("osd-tl").textContent = `CH1: ${activeCh.scale}`;
    document.getElementById("osd-bl").textContent = `Offset: ${activeCh.offset}`;

    // Zaman tabanı bölümleri (15.2 division)
    const divWidth = state.windowSize / 15.2;
    const xCenter = (state.windowSize - 1) / 2;

    let startIdx = state.windowStart;
    let endIdx = Math.min(startIdx + state.windowSize, state.signal.length);
    let dataSlice = [];
    for (let i = startIdx; i < endIdx; i++) dataSlice.push(state.signal[i]);

    while (dataSlice.length < state.windowSize) {
        dataSlice.push(null);
    }

    if (meta.timebase) {
        document.getElementById("osd-br").textContent = `Time: ${meta.timebase.scale}`;
    }
    document.getElementById("osd-tr").textContent = `${dataSlice.length} pts`;

    const yCenter = (minVolt + maxVolt) / 2;

    // Y-Axis: 11 tick (10 bölüm)
    const yTicks = [];
    const yStep = (maxVolt - minVolt) / 10;
    for (let i = 0; i <= 10; i++) {
        yTicks.push(minVolt + i * yStep);
    }

    // X-Axis: Merkeze göre tam bölüm tick'leri
    const xTicks = [];
    for (let d = -7; d <= 7; d++) {
        xTicks.push(xCenter + d * divWidth);
    }

    Highcharts.chart('scopeScreenChart', {
        chart: {
            type: 'line',
            backgroundColor: '#000000',
            animation: false,
            margin: [25, 30, 25, 40]
        },
        title: { text: undefined },
        boost: { useGPUTranslations: true, usePreallocated: true },
        xAxis: {
            min: 0,
            max: state.windowSize,
            gridLineWidth: 1,
            gridLineColor: '#333',
            tickPositions: xTicks,
            labels: {
                enabled: true,
                style: { color: '#0f0', fontSize: '10px' },
                formatter: function () {
                    const divVal = (this.value - xCenter) / divWidth;
                    return Math.round(divVal).toFixed(0);
                },
                y: 15
            },
            tickLength: 5,
            tickColor: '#333',
            lineWidth: 0,
            plotLines: [{
                value: xCenter,
                color: '#666',
                width: 2,
                zIndex: 2
            }]
        },
        yAxis: {
            min: minVolt,
            max: maxVolt,
            gridLineWidth: 1,
            gridLineColor: '#333',
            tickPositions: yTicks,
            title: { text: undefined },
            labels: { enabled: false },
            plotLines: [{
                value: yCenter,
                color: '#666',
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
                color: '#00ff00',
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

function openScopeScreen() {
    openModal('scopeScreenModal');
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (window.drawScopeScreen) window.drawScopeScreen();
    }, 100);
}

// Global exposure
window.drawScopeScreen = drawScopeScreen;
window.openScopeScreen = openScopeScreen;
