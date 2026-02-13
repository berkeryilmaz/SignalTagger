// UI: Analysis & Charts

// UI: Analysis & Charts

// Global variables for sorting are no longer needed with DataTables

function renderAnalysisTable() {
    let tableBody = document.getElementById("analysisTableBody");
    if (!tableBody) return;

    if (!window.analysisData || window.analysisData.length === 0) {
        // DataTables doesn't like empty bodies on init if we want to add data later easily, 
        // but let's clear it.
        if ($.fn.DataTable.isDataTable('#analysisTable')) {
            $('#analysisTable').DataTable().clear().draw();
        } else {
            tableBody.innerHTML = `<tr><td colspan="8" class="table-empty-msg">No labeled regions found. Use "Manage Classes" to add labels.</td></tr>`;
        }
        return;
    }

    // Prepare data for DataTables
    const tableData = window.analysisData.map(row => {
        let className = row.label;
        if (state.labelTypes && state.labelTypes[row.label]) {
            className = `${row.label} (${state.labelTypes[row.label].name})`;
        }
        return {
            id: row.id,
            className: className,
            start: row.start,
            end: row.end,
            width: row.width,
            fwhm: row.fwhm,
            maxVal: row.maxVal,
            area: row.area,
            rawLabel: row.label, // for coloring or other needs
            DT_RowId: `row_${row.id}` // helps with selection
        };
    });

    if ($.fn.DataTable.isDataTable('#analysisTable')) {
        let dt = $('#analysisTable').DataTable();
        dt.clear();
        dt.rows.add(tableData);
        dt.draw();
    } else {
        // Initialize
        $('#analysisTable').DataTable({
            data: tableData,
            columns: [
                { data: 'id', title: 'ID' },
                { data: 'className', title: 'Class' },
                { data: 'start', title: 'Start' },
                { data: 'end', title: 'End' },
                { data: 'width', title: 'Width (N)' },
                { data: 'fwhm', title: 'FWHM' },
                { data: 'maxVal', title: 'Max Voltage', className: 'text-peak-color' },
                { data: 'area', title: 'Area (V·s)' }
            ],
            paging: false,       // Disable paging to show all rows in scrollable area
            scrollY: 'calc(100% - 40px)', // Fill container minus header height
            scrollCollapse: true,
            searching: false,
            ordering: true,
            info: true,
            autoWidth: false,
            // Theme integration
            createdRow: function (row, data, dataIndex) {
                $(row).on('click', function () {
                    $('#analysisTableBody tr').removeClass('selected');
                    $(this).addClass('selected');
                    if (window.jumpToCallback) window.jumpToCallback(data.start, data.end);
                });
            }
        });
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
            { key: 'fwhm', inputId: 'binsFWHM', dataFn: d => d.fwhm },
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
// Global exposure
window.renderAnalysisTable = renderAnalysisTable;
window.renderAnalysisTable = renderAnalysisTable;
window.showPeakDistributions = showPeakDistributions;
