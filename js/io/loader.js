// IO: Loader

function loadCSV(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    // Check for .bin files
    if (file.name.toLowerCase().endsWith('.bin')) {
        loadBin(files);
        return;
    }

    resetState();
    showLoading("Analyzing File Size...", "Pass 1/2");

    let rowCount = 0;

    // Read first chunk for metadata
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const firstLine = text.split('\n')[0];
        if (firstLine.startsWith("# METADATA: ")) {
            const jsonStr = firstLine.substring(12);
            if (window.importMetadata) window.importMetadata(jsonStr);
        }
    };
    // Read just enough bytes to likely catch the first line
    reader.readAsText(file.slice(0, 10000));

    Papa.parse(file, {
        worker: false,
        step: undefined,
        comments: "#", // Skip metadata/comments
        chunk: function (results) {
            rowCount += results.data.length;
        },
        complete: function () {
            console.log("Estimated rows:", rowCount);
            startPass2(file, rowCount);
        },
        error: function (err) {
            console.error(err);
            alert("Error reading file: " + err.message);
            hideLoading();
        }
    });
}

function startPass2(file, totalRows) {
    if (elements.loadingText) elements.loadingText.textContent = "Loading Data... (Pass 2/2)";

    let signal, labels;
    try {
        signal = new Float32Array(totalRows);
        labels = new Int8Array(totalRows);
    } catch (e) {
        alert("Not enough memory to load this file! Try a smaller file.");
        hideLoading();
        return;
    }

    let currentIndex = 0;
    let voltageKey = null;
    let labelKey = null;
    let headerFound = false;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        comments: "#",
        chunk: function (results, parser) {
            let data = results.data;
            let meta = results.meta;
            let fields = meta.fields || [];

            if (!headerFound) {
                voltageKey = fields.find(f => f.toLowerCase().match(/volt|signal|value|data/)) || (fields.length > 1 ? fields[1] : fields[0]);
                if (!voltageKey && fields.includes("0")) voltageKey = "0";

                labelKey = fields.find(f => f.toLowerCase().match(/label|target|class/));
                headerFound = true;
            }

            let len = data.length;
            for (let i = 0; i < len; i++) {
                if (currentIndex >= signal.length) break;

                let row = data[i];
                let v = parseFloat(row[voltageKey]);

                if (isNaN(v)) {
                    v = (currentIndex > 0) ? signal[currentIndex - 1] : 0;
                }

                signal[currentIndex] = v;

                let l = 0;
                if (labelKey && row[labelKey] !== undefined) {
                    l = parseInt(row[labelKey]);
                    if (isNaN(l)) l = 0;
                    if (l !== 0 && window.ensureClass) window.ensureClass(l);
                }
                labels[currentIndex] = l;

                currentIndex++;
            }

            let percent = Math.min(100, Math.round((currentIndex / totalRows) * 100));
            updateProgressBar(percent);
        },
        complete: function () {
            if (elements.loadingText) elements.loadingText.textContent = "Rendering...";

            setTimeout(() => {
                let globalMin = Infinity;
                let globalMax = -Infinity;
                let len = signal.length;
                let effectiveLen = Math.min(currentIndex, len);

                for (let i = 0; i < effectiveLen; i++) {
                    let v = signal[i];
                    if (v < globalMin) globalMin = v;
                    if (v > globalMax) globalMax = v;
                }

                let rawDeriv = new Float32Array(len);
                let factor = Math.pow(10, state.dataPrecision);

                for (let i = 1; i < effectiveLen - 1; i++) {
                    rawDeriv[i] = Math.round(((signal[i + 1] - signal[i - 1]) / 2) * factor) / factor;
                }

                updateState({
                    signal: signal,
                    labels: labels,
                    globalMin: globalMin,
                    globalMax: globalMax,
                    rawDerivativeSignal: rawDeriv
                });

                if (window.renderClassButtons) window.renderClassButtons(); // from main.js (later)

                updateState({ windowStart: 0 });
                if (elements.windowSizeInput) elements.windowSizeInput.value = state.windowSize;
                if (elements.strideInput) elements.strideInput.value = state.stride;
                updateSliderMax();

                draw(true);

                if (document.getElementById("file-status"))
                    document.getElementById("file-status").textContent = `File: ${file.name} (${effectiveLen.toLocaleString()} pts)`;
                hideLoading();

            }, 50);
        },
        error: function (err) {
            console.error(err);
            alert("Error parsing CSV: " + err.message);
            hideLoading();
        }
    });

}

async function loadBin(files) {
    resetState();
    showLoading("Parsing Binary Files...", "Processing");

    try {
        const setup = await window.binLoader.parseFiles(files);
        if (!setup) {
            throw new Error("No valid data found in files.");
        }

        // Store for Scope Modal
        updateState({ scopeMetadata: setup });

        // Find active channel
        // Python: getActiveChannel returns channels with display == 'ON'
        // We'll take the first active one, or the first one if none active
        let activeCh = setup.channel.find(ch => ch.display === 'ON');
        if (!activeCh && setup.channel.length > 0) {
            activeCh = setup.channel[0];
        }

        if (!activeCh) {
            throw new Error("No active channels found.");
        }

        const signal = activeCh.data; // Float32Array already
        const len = signal.length;
        const labels = new Int8Array(len); // Zeros

        // Calculate metadata
        let globalMin = Infinity;
        let globalMax = -Infinity;
        for (let i = 0; i < len; i++) {
            let v = signal[i];
            if (v < globalMin) globalMin = v;
            if (v > globalMax) globalMax = v;
        }

        // Calculate Derivative
        let rawDeriv = new Float32Array(len);
        let factor = Math.pow(10, state.dataPrecision);
        for (let i = 1; i < len - 1; i++) {
            rawDeriv[i] = Math.round(((signal[i + 1] - signal[i - 1]) / 2) * factor) / factor;
        }

        updateState({
            signal: signal,
            labels: labels,
            globalMin: globalMin,
            globalMax: globalMax,
            rawDerivativeSignal: rawDeriv
        });

        // Update UI for Oscilloscope Config
        displayOscilloscopeConfig(setup);

        // Update Window/Stride defaults if needed
        updateState({ windowStart: 0 });
        if (elements.windowSizeInput) elements.windowSizeInput.value = state.windowSize;
        if (elements.strideInput) elements.strideInput.value = state.stride;
        updateSliderMax();

        draw(true);

        const fileName = files.length > 1 ? `${files.length} files merged` : files[0].name;
        if (document.getElementById("file-status"))
            document.getElementById("file-status").textContent = `File: ${fileName} (${len.toLocaleString()} pts)`;

        hideLoading();

    } catch (e) {
        console.error(e);
        alert("Error loading .bin: " + e.message);
        hideLoading();
    }
}

function displayOscilloscopeConfig(setup) {
    // Show the button
    const btn = document.getElementById('oscilloscopeInfoBtn');
    if (btn) btn.classList.remove('hidden');

    const container = document.getElementById('oscilloscopeConfigContent');
    if (!container) return;

    // Helper text for empty fields
    const safeStr = (s) => (s && s !== 'N/A') ? s : '<span style="color:var(--text-muted)">-</span>';

    // 1. Device & Run Status
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

    // 2. Timebase & Sample
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

    // 3. Trigger (if available)
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

    // 4. Channels
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

async function loadReference(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const firstFile = files[0];

    // Handle .bin files (Multi-file support)
    if (firstFile.name.toLowerCase().endsWith('.bin')) {
        try {
            const fileCount = files.length;
            showLoading(`Parsing ${fileCount} Reference .bin files...`, "Processing");

            // Parse and merge all selected files
            const setup = await window.binLoader.parseFiles(files);

            if (setup && setup.channel) {
                // Use the first active channel, or just the first channel
                let chVal = setup.channel.find(c => c.display === 'ON') || setup.channel[0];

                if (chVal && chVal.data && chVal.data.length > 0) {
                    let refs = state.referenceSignals;

                    // Construct a name
                    let refName = firstFile.name;
                    if (files.length > 1) {
                        refName += ` (+${files.length - 1} files)`;
                    }

                    refs.push({
                        name: refName,
                        data: chVal.data, // This is a Float32Array
                        color: getRandomColor()
                    });
                    input.value = "";
                    draw(false);
                } else {
                    alert("No valid channel data found in reference file.");
                }
            }
            hideLoading();
        } catch (e) {
            console.error(e);
            alert("Error loading reference bin: " + e.message);
            hideLoading();
        }
        return;
    }

    // Default CSV handling (Single file only for now as PapaParse logic is single-file based)
    Papa.parse(firstFile, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function (results) {
            let refData = new Float32Array(results.data.length);
            results.data.forEach((row, i) => {
                let val = row.signal !== undefined ? row.signal : row[Object.keys(row)[1]];
                refData[i] = typeof val === 'number' ? val : 0;
            });

            let refs = state.referenceSignals;
            refs.push({
                name: firstFile.name,
                data: refData,
                color: getRandomColor()
            });

            input.value = "";
            draw(false);
        }
    });
}

function clearReferences() {
    updateState({ referenceSignals: [] });
    draw(false);
}

window.loadCSV = loadCSV;
window.loadReference = loadReference;
window.clearReferences = clearReferences;

console.log("loader.js loaded successfully");
