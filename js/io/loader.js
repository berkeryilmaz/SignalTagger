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

        // Find active channels (display === 'ON')
        const activeChannels = (setup.channel || [])
            .map((ch, idx) => ({ channel: ch, index: idx }))
            .filter(item => item.channel.display === 'ON' && item.channel.successful_read);

        if (activeChannels.length === 0) {
            throw new Error("No active channels found.");
        }

        hideLoading();

        let selectedCh;

        if (activeChannels.length === 1) {
            // Tek aktif kanal — otomatik seç
            selectedCh = activeChannels[0].channel;
        } else {
            // Birden fazla aktif kanal — kullanıcıya sor
            selectedCh = await showChannelSelectDialog(activeChannels);
            if (!selectedCh) {
                // Kullanıcı iptal etti
                return;
            }
        }

        showLoading("Processing Signal...", "Rendering");

        // DT otomatik hesapla
        autoCalculateDT(setup);

        // Sinyali yükle
        finalizeBinImport(selectedCh, setup, files);

    } catch (e) {
        console.error(e);
        alert("Error loading .bin: " + e.message);
        hideLoading();
    }
}

/**
 * BIN header'dan DT'yi otomatik hesaplar.
 * Formül: DT = SCOPE_DIVS_HORIZONTAL * timebase_scale / sample_fullscreen
 *
 * Burada:
 *   SCOPE_DIVS_HORIZONTAL = 15.2 (ekrandaki yatay div sayısı)
 *   timebase_scale = timebase.scale string'inden parse edilen saniye değeri
 *   sample_fullscreen = sample.fullscreen (ekrandaki nokta sayısı), yoksa sample.datalen
 */
function autoCalculateDT(setup) {
    if (!setup.timebase || !setup.timebase.scale) return;

    const timebaseScaleSec = window.binLoader.parseTimeScale(setup.timebase.scale);
    if (timebaseScaleSec <= 0) return;

    // sample.fullscreen yoksa sample.datalen kullan
    const sampleFullscreen = (setup.sample && setup.sample.fullscreen)
        ? setup.sample.fullscreen
        : (setup.sample && setup.sample.datalen)
            ? setup.sample.datalen
            : 0;

    if (sampleFullscreen <= 0) return;

    const DIVS = window.SCOPE_DIVS_HORIZONTAL || 15.2;

    // DT (saniye) = 15.2 * timebase_scale / fullscreen
    const dtSeconds = DIVS * timebaseScaleSec / sampleFullscreen;

    // Uygun birimi bul (ps, ns, us, ms, s)
    let dtValue = dtSeconds;
    let dtUnit = 's';

    const unitTable = [
        { limit: 1e-12, unit: 'p', mult: 1e12 },   // pikosaniye
        { limit: 1e-9,  unit: 'n', mult: 1e9 },     // nanosaniye
        { limit: 1e-6,  unit: 'u', mult: 1e6 },     // mikrosaniye
        { limit: 1e-3,  unit: 'm', mult: 1e3 },     // milisaniye
    ];

    for (const u of unitTable) {
        if (dtSeconds < u.limit * 1000) {
            dtValue = dtSeconds * u.mult;
            dtUnit = u.unit;
            break;
        }
    }

    // Hassasiyeti ayarla
    dtValue = parseFloat(dtValue.toPrecision(6));

    // State güncelle
    state.physics.dt = dtValue;
    state.physics.dt_unit = dtUnit;

    // UI güncelle
    const dtInput = document.getElementById('physDt');
    const dtUnitSelect = document.getElementById('physDtUnit');
    if (dtInput) dtInput.value = dtValue;
    if (dtUnitSelect) dtUnitSelect.value = dtUnit;

    console.log(`Auto DT: ${dtValue} ${dtUnit} (${dtSeconds} s) — from ${setup.timebase.scale}, fullscreen=${sampleFullscreen}`);
}

/**
 * Kanal seçim dialogunu gösterir.
 * @returns {Promise<object|null>} Seçilen kanal objesi, iptal edilirse null
 */
function showChannelSelectDialog(activeChannels) {
    return new Promise((resolve) => {
        const container = document.getElementById('channelSelectList');
        if (!container) {
            resolve(activeChannels[0].channel);
            return;
        }

        container.innerHTML = '';

        activeChannels.forEach((item) => {
            const ch = item.channel;
            const btn = document.createElement('button');
            btn.className = 'modal-btn';
            btn.style.textAlign = 'left';
            btn.innerHTML = `<strong>${ch.name || ('CH' + (item.index + 1))}</strong> — Scale: ${ch.scale || '?'}, Probe: ${ch.probe || '?'}`;
            btn.onclick = () => {
                closeModal('channelSelectModal');
                resolve(ch);
            };
            container.appendChild(btn);
        });

        // Cancel butonu için
        const modal = document.getElementById('channelSelectModal');
        const cancelHandler = () => {
            modal.removeEventListener('click', outsideClickHandler);
            resolve(null);
        };

        const cancelBtn = modal.querySelector('.btn-text-only');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeModal('channelSelectModal');
                cancelHandler();
            };
        }

        // Dışarı tıklama ile kapatma
        const outsideClickHandler = (e) => {
            if (e.target === modal) {
                closeModal('channelSelectModal');
                cancelHandler();
            }
        };
        modal.addEventListener('click', outsideClickHandler);

        openModal('channelSelectModal');
    });
}

/**
 * BIN import sonrası ortak işlemleri yapar (sinyal yükleme, türev, UI güncelleme).
 */
function finalizeBinImport(activeCh, setup, files) {
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
}

// displayOscilloscopeConfig moved to js/ui/oscilloscope_config_ui.js


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
                // Find active channels
                const activeChannels = (setup.channel || [])
                    .map((ch, idx) => ({ channel: ch, index: idx }))
                    .filter(item => item.channel.display === 'ON' && item.channel.successful_read);

                hideLoading();

                let chVal;
                if (activeChannels.length === 0) {
                    alert("No active channels found in reference file.");
                    return;
                } else if (activeChannels.length === 1) {
                    chVal = activeChannels[0].channel;
                } else {
                    // Birden fazla aktif kanal — kullanıcıya sor
                    chVal = await showChannelSelectDialog(activeChannels);
                    if (!chVal) return; // İptal
                }

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
