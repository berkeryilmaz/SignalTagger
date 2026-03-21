// UI: Scope Screen — Osiloskop Ekranı Çizimi (OWON XDS 3302)
// Dedicated scope screen modal için Highcharts çizimini yönetir.

function drawScopeScreen() {
    const modal = document.getElementById("scopeScreenModal");
    if (!modal || modal.style.display === "none") return;

    if (!state.signal || state.signal.length === 0) return;
    if (!state.scopeMetadata) return;

    const meta = state.scopeMetadata;
    let activeCh = meta.channel.find(c => c.display === 'ON') || meta.channel[0];

    // ─── Kanal Parametrelerini Çıkar ────────────────────────────
    const parseVolts = (str) => {
        let v = parseFloat(str);
        if (str.includes('mV')) v /= 1000;
        return v;
    };

    const scale = parseVolts(activeCh.scale);
    const probe = parseFloat(activeCh.probe.replace('x', '')) || 1;
    const offsetRaw = parseFloat(activeCh.offset) || 0;

    // ─── ADC → Volt Dönüşümü ───────────────────────────────────
    // Paylaşılan rawToVoltage() fonksiyonu kullanılır (utils.js).
    // 12-bit signed ADC: [-2048, 2047] aralığı
    const minVolt = rawToVoltage(-2048, offsetRaw, scale, probe);
    const maxVolt = rawToVoltage(2047, offsetRaw, scale, probe);

    // OSD güncelle
    document.getElementById("osd-tl").textContent = `CH1: ${activeCh.scale}`;
    document.getElementById("osd-bl").textContent = `Offset: ${activeCh.offset}`;

    // ─── Osiloskop Ekran Düzeni ────────────────────────────────
    //
    // OWON XDS 3302 ekranı:
    //   Yatay: 15.2 division (SCOPE_DIVS_HORIZONTAL, constants.js)
    //   Dikey: 10 division (5 yukarı + 5 aşağı, SCOPE_DIVS_VERTICAL)
    //
    // divWidth: Her yatay division'daki örnek (sample) sayısı
    //   divWidth = windowSize / 15.2
    const divWidth = state.windowSize / SCOPE_DIVS_HORIZONTAL;
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

    // Y-Axis: 11 tick (10 aralık = SCOPE_DIVS_VERTICAL bölüm)
    //   minVolt'tan maxVolt'a eşit adımlar
    const yTicks = [];
    const yStep = (maxVolt - minVolt) / SCOPE_DIVS_VERTICAL;
    for (let i = 0; i <= SCOPE_DIVS_VERTICAL; i++) {
        yTicks.push(minVolt + i * yStep);
    }

    // X-Axis: Merkeze göre ±7 division tick'i
    //   15.2 ÷ 2 ≈ 7.6 → 7 tam division yeterli (±7 = 15 div kapsar)
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
