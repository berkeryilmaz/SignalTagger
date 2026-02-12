// IO: Loader

function loadCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

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

function loadReferenceCSV(input) {
    const file = input.files[0];
    if (!file) return;

    Papa.parse(file, {
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
                name: file.name,
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
window.loadReferenceCSV = loadReferenceCSV;
window.clearReferences = clearReferences;
