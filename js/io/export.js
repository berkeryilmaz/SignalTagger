// IO: Export

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

        dataToExport.push(`${i},${sourceSignal[i]},${l}`);
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

    let headers = ["ID", "Start", "End", "Width", "MaxVal", "Area"];
    let rows = window.analysisData.map(r => `${r.id},${r.start},${r.end},${r.width},${r.maxVal},${r.area}`);

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
