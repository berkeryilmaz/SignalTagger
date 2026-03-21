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

window.performExport = performExport;
window.exportAnalysisTable = exportAnalysisTable;
