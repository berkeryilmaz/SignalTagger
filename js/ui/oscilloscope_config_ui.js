// UI: Oscilloscope Configuration Display
// Binary dosya yüklendiğinde osiloskop konfigürasyonunu gösterir.

function displayOscilloscopeConfig(setup) {
    const btn = document.getElementById('oscilloscopeInfoBtn');
    if (btn) btn.classList.remove('hidden');

    const container = document.getElementById('oscilloscopeConfigContent');
    if (!container) return;

    const safeStr = (s) => (s && s !== 'N/A') ? s : '<span style="color:var(--text-muted)">-</span>';

    // 1. Cihaz & Çalışma Durumu
    let html = `
        <div class="config-group">
            <h4>Device</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <p><strong>Model:</strong> ${safeStr(setup.model)}</p>
                <p><strong>Status:</strong> ${safeStr(setup.runstatus)}</p>
                <p><strong>IDN:</strong> ${safeStr(setup.idn)}</p>
            </div>
        </div>
    `;

    // 2. Zaman Tabanı & Örnekleme
    html += `
        <div class="config-group">
            <h4>Timebase & Acquisition</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <p><strong>Scale:</strong> ${safeStr(setup.timebase?.scale)}</p>
                <p><strong>H. Offset:</strong> ${safeStr(setup.timebase?.ho)}</p>
                <p><strong>Total Points:</strong> ${safeStr(setup.sample?.datalen)}</p>
                <p><strong>Format:</strong> ${safeStr(setup.datatype)}</p>
            </div>
        </div>
    `;

    // 3. Tetikleme (Trigger)
    if (setup.trig) {
        html += `
            <div class="config-group">
                <h4>Trigger</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <p><strong>Mode:</strong> ${safeStr(setup.trig.mode)}</p>
                    <p><strong>Source:</strong> ${safeStr(setup.trig.source)}</p>
                    <p><strong>Level:</strong> ${safeStr(setup.trig.level)}</p>
                    <p><strong>Slope:</strong> ${safeStr(setup.trig.slope)}</p>
                </div>
            </div>
        `;
    }

    html += `<hr style="border-color: var(--border-color); margin: 15px 0;"/><h4>Channels</h4>`;

    // 4. Kanallar
    setup.channel.forEach((ch, i) => {
        const isActive = ch.display === 'ON';
        html += `
            <div class="config-subgroup ${isActive ? 'active-channel' : 'inactive-channel'}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <h5 style="margin:0;">${ch.name}</h5>
                    <span style="font-size:0.75rem; color:${isActive ? 'var(--accent-color)' : 'var(--text-muted)'}">
                        ${ch.display}
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                    <p><strong>Scale:</strong> ${safeStr(ch.scale)}</p>
                    <p><strong>Probe:</strong> ${safeStr(ch.probe)}</p>
                    <p><strong>Offset:</strong> ${safeStr(ch.offset)}</p>
                    <p><strong>Coupling:</strong> ${safeStr(ch.coupling)}</p>
                    <p><strong>Invert:</strong> ${safeStr(ch.inverse)}</p>
                    <p><strong>BW Limit:</strong> ${safeStr(ch.bwlimit)}</p>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Global exposure
window.displayOscilloscopeConfig = displayOscilloscopeConfig;
