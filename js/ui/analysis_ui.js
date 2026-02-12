// UI: Analysis & Charts

function renderAnalysisTable() {
    let tableBody = document.getElementById("analysisTableBody");
    if (!tableBody) return;

    if (!window.analysisData || window.analysisData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="table-empty-msg">No labeled regions found. Use "Manage Classes" to add labels.</td></tr>`;
        return;
    }

    // Sort if needed
    if (typeof currentSortCol !== 'undefined' && currentSortCol) {
        window.analysisData.sort((a, b) => {
            let valA = a[currentSortCol];
            let valB = b[currentSortCol];
            return currentSortDir === 1 ? (valA - valB) : (valB - valA);
        });
    }

    // Clear and Rebuild
    tableBody.innerHTML = "";
    window.analysisData.forEach(row => {
        let tr = document.createElement("tr");

        // Get class name if possible
        let className = row.label;
        if (state.labelTypes && state.labelTypes[row.label]) {
            className = `${row.label} (${state.labelTypes[row.label].name})`;
        }

        tr.innerHTML = `
            <td>#${row.id}</td>
            <td>${className}</td>
            <td>${row.start}</td>
            <td>${row.end}</td>
            <td>${row.width}</td>
            <td class="text-peak-color">${row.maxVal}</td>
            <td>${row.area}</td>
        `;

        tr.onclick = () => {
            document.querySelectorAll("#analysisTableBody tr").forEach(r => r.classList.remove("selected"));
            tr.classList.add("selected");
            if (window.jumpToCallback) window.jumpToCallback(row.start, row.end);
        };

        tableBody.appendChild(tr);
    });

    // Update sort icons
    document.querySelectorAll(".sort-icon").forEach(el => el.textContent = "");
    if (typeof currentSortCol !== 'undefined' && currentSortCol) {
        let icon = currentSortDir === 1 ? "▲" : "▼";
        const th = document.getElementById(`sort-${currentSortCol}`);
        if (th) th.textContent = icon;
    }
}

function showPeakDistributions(e) {
    if (e) e.stopPropagation();
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    // Ensure analysis is up to date
    if (!window.analysisData || window.analysisData.length === 0) {
        if (window.updatePeakAnalysis) window.updatePeakAnalysis();
    }

    if (!window.analysisData || window.analysisData.length === 0) return alert("No peaks found to analyze.");

    if (window.openModal) window.openModal('peakDistModal');

    // Draw 3 charts with Auto-Binning (Freedman-Diaconis)
    setTimeout(() => {
        // Defines
        const types = [
            { key: 'width', inputId: 'binsWidth', dataFn: d => d.width },
            { key: 'voltage', inputId: 'binsVoltage', dataFn: d => d.maxVal },
            { key: 'area', inputId: 'binsArea', dataFn: d => d.area }
        ];

        types.forEach(type => {
            // 1. Extract Data
            const values = window.analysisData.map(type.dataFn);

            // 2. Calculate Optimal Bins if helper exists
            let optimalBins = 20;
            if (window.calculateOptimalBins) {
                try {
                    optimalBins = window.calculateOptimalBins(values);
                } catch (err) { console.error(err); }
            }

            // 3. Update Input
            const input = document.getElementById(type.inputId);
            if (input) input.value = optimalBins;

            // 4. Render Chart
            if (window.updateSingleDistChart) {
                window.updateSingleDistChart(type.key);
            }
        });
    }, 100);
}

// Global exposure
window.renderAnalysisTable = renderAnalysisTable;
window.showPeakDistributions = showPeakDistributions;
