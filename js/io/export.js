// IO: Export

/**
 * Export için sayısal değerleri formatlar.
 * Maximum 9 anlamlı basamak (significant digit) kullanır.
 * Gereksiz sondaki sıfırlar parseFloat ile temizlenir.
 *
 * Neden toPrecision(9)?
 *   - toFixed yerine toPrecision kullanılır çünkü fizik değerleri
 *     çok geniş ölçek aralığında olabilir (ör: 1.23e-19 C, 0.005 V).
 *   - toPrecision, değerin doğal ölçeğini koruyarak 9 anlamlı
 *     basamak verir.
 *
 * @param {number} val - Formatlanacak sayısal değer
 * @returns {string|*} Formatlanmış string veya orijinal değer (NaN/null ise)
 */
function formatForExport(val) {
    if (val == null || isNaN(val)) return val;
    return parseFloat(val.toPrecision(9));
}

function performExport(type) {
    if (!state.signal || state.signal.length === 0) return alert("Nothing to export!");

    let dataToExport = [];
    let headers = ["index", "signal", "label"];
    let csvContent = "";

    let start = 0;
    let end = state.signal.length;

    if (type === 'progress') {
        end = Math.min(state.windowStart + state.windowSize, state.signal.length);
    } else if (type === 'onlyLabels') {
        // filter below
    }

    let sourceSignal = (type === 'smoothed' && state.smoothedSignal) ? state.smoothedSignal : state.signal;
    if (type === 'smoothed') headers[1] = "smoothed_signal";

    for (let i = start; i < end; i++) {
        let l = state.labels[i];
        if (type === 'onlyLabels' && l === 0) continue;

        dataToExport.push(`${i},${formatForExport(sourceSignal[i])},${l}`);
    }

    if (dataToExport.length === 0) return alert("No data matches criteria.");

    let metadataLine = "";
    if (window.exportMetadata) {
        metadataLine = "# METADATA: " + window.exportMetadata() + "\n";
    }

    csvContent = metadataLine + headers.join(",") + "\n" + dataToExport.join("\n");
    downloadCSV(csvContent, `export_${type}_${Date.now()}.csv`);
    closeModal('exportModal');
}

function exportAnalysisTable() {
    // Assuming analysisData is available globally now via peaks.js
    if (!window.analysisData || window.analysisData.length === 0) return alert("No analysis data!");

    // SI prefix ölçekleme — analysis_ui.js ile aynı mantık
    const charges = window.analysisData.map(d => d.charge);
    const energies = window.analysisData.map(d => d.energy);
    const energyEVs = window.analysisData.map(d => d.energyEV);

    const qUnit = window.calculateColumnUnit ? window.calculateColumnUnit(charges) : { scale: 1, prefix: '' };
    const eUnit = window.calculateColumnUnit ? window.calculateColumnUnit(energies) : { scale: 1, prefix: '' };
    const evUnit = window.calculateColumnUnit ? window.calculateColumnUnit(energyEVs) : { scale: 1, prefix: '' };

    // Dinamik header'lar — tablodaki ile birebir aynı
    let headers = [
        "ID", "Class", "Start", "End", "Width (N)", "FWHM", "Max Voltage",
        "Sum(V) (V·s)", "Sum(V^2) (V^2·s)",
        `Charge (${qUnit.prefix}C)`,
        `Energy (${eUnit.prefix}J)`,
        `Energy (${evUnit.prefix}eV)`
    ];

    let rows = window.analysisData.map(r => {
        let className = r.label;
        if (state.labelTypes && state.labelTypes[r.label]) {
            className = `${r.label} (${state.labelTypes[r.label].name})`;
        }
        return [
            r.id,
            className,
            r.start,
            r.end,
            r.width,
            formatForExport(r.fwhm),
            formatForExport(r.maxVal),
            formatForExport(r.area),
            formatForExport(r.sumVSq),
            formatForExport(r.charge * qUnit.scale),
            formatForExport(r.energy * eUnit.scale),
            formatForExport(r.energyEV * evUnit.scale)
        ].join(',');
    });

    let csvContent = headers.join(",") + "\n" + rows.join("\n");
    downloadCSV(csvContent, `analysis_table_${Date.now()}.csv`);
    closeModal('exportModal');
}

function downloadCSV(content, filename) {
    let blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    if (link.download !== undefined) {
        let url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Sadece sinyal verisini (index + voltage) dışa aktarır.
 * Precision, toolbar'daki dataPrecision (Prec) ayarına göre
 * roundToPrecision ile uygulanır.
 */
function exportSignalOnly() {
    if (!state.signal || state.signal.length === 0) return alert("Nothing to export!");

    const precision = state.dataPrecision;
    const factor = Math.pow(10, precision);

    let rows = [];
    for (let i = 0; i < state.signal.length; i++) {
        const v = Math.round(state.signal[i] * factor) / factor;
        rows.push(`${i},${v}`);
    }

    let csvContent = "index,voltage\n" + rows.join("\n");
    downloadCSV(csvContent, `signal_only_${Date.now()}.csv`);
    closeModal('exportModal');
}

/**
 * Her satır bir bölge (region) sinyal dalga formu olacak şekilde CSV formatında dışa aktarır.
 * İlk sütun ID (Peak Analysis Table ID'si ile eşleşir).
 * Sonraki sütunlar: s0, s1, s2, ..., s_{L-1}.
 *
 * @param {number} fixedLength - İstenen sabit sütun sayısı (0 = otomatik en geniş bölge boyu)
 * @param {string} [filename] - Opsiyonel dosya adı
 */
function exportRegionWaveforms(fixedLength = 0, filename = null) {
    if (!state.signal || state.signal.length === 0) return alert("Nothing to export!");

    let regions = [];
    if (window.analysisData && window.analysisData.length > 0) {
        regions = window.analysisData.map((r, i) => ({
            id: r.id !== undefined ? r.id : (i + 1),
            start: r.start,
            end: r.end
        }));
    } else if (state.labels && window.findLabeledRegions) {
        regions = window.findLabeledRegions(state.labels).map((r, i) => ({
            id: i + 1,
            start: r.start,
            end: r.end
        }));
    }

    if (regions.length === 0) return alert("No labeled regions found to export!");

    let L = parseInt(fixedLength) || 0;
    if (L <= 0) {
        L = Math.max(...regions.map(r => r.end - r.start + 1));
    }
    L = Math.max(1, L);

    const sourceSignal = (state.isSmoothEnabled && state.smoothedSignal) ? state.smoothedSignal : state.signal;
    const precision = (state && state.dataPrecision !== undefined) ? state.dataPrecision : 3;
    const factor = Math.pow(10, precision);

    let headers = ['id'];
    for (let k = 0; k < L; k++) headers.push(`s${k}`);

    let rows = regions.map(r => {
        let rowVals = [r.id];
        for (let k = 0; k < L; k++) {
            let sIdx = r.start + k;
            let val = 0;
            if (sIdx >= 0 && sIdx < sourceSignal.length && sIdx <= r.end) {
                val = sourceSignal[sIdx];
            } else if (sIdx >= sourceSignal.length) {
                val = sourceSignal[sourceSignal.length - 1];
            } else {
                val = 0;
            }
            if (val == null || isNaN(val)) {
                rowVals.push('');
            } else if (typeof val === 'number') {
                let rounded = Math.round(val * factor) / factor;
                rowVals.push(rounded);
            } else {
                rowVals.push(val);
            }
        }
        return rowVals.join(',');
    });

    let csvContent = headers.join(',') + '\n' + rows.join('\n');
    downloadCSV(csvContent, filename || `region_waveforms_${Date.now()}.csv`);
    closeModal('exportModal');
}

function exportRegionWaveformsPrompt() {
    let lenInput = prompt("Waveform length (column count) [0 or empty = auto / max region length]:", "0");
    if (lenInput === null) return;
    let L = parseInt(lenInput) || 0;
    exportRegionWaveforms(L);
}

window.performExport = performExport;
window.exportAnalysisTable = exportAnalysisTable;
window.exportSignalOnly = exportSignalOnly;
window.exportRegionWaveforms = exportRegionWaveforms;
window.exportRegionWaveformsPrompt = exportRegionWaveformsPrompt;
