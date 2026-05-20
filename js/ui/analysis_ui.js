/**
 * UI: Analysis & Charts — Analiz Tablosu ve Dağılım Grafikleri
 *
 * ─── Analiz Tablosu Sütun Açıklamaları ─────────────────────────
 *
 * ∑(V)     = Σ (V(tᵢ) - baseline)     → Baseline düşülmüş gerilim toplamı
 * ∑(V²)    = Σ (V(tᵢ) - baseline)²   → Gerilim kare toplamı
 * Charge   = ∑(V) × dt / R            → Coulomb (yük)
 * Energy   = ∑(V²) × dt / R           → Joule (enerji)
 * FWHM     = Yarı yükseklikte tam genişlik (sample cinsinden)
 *
 * Fizik hesaplamalarının detayları: physics.js
 */


// Global variables for sorting are no longer needed with DataTables

function updateTableClassFilterDropdown() {
    const select = document.getElementById('tableClassFilter');
    if (!select) return;
    const currentVal = select.value || 'all';
    
    // Preserve selection
    select.innerHTML = '<option value="all">All Classes</option>';
    
    if (state.labelTypes) {
        Object.keys(state.labelTypes).forEach(key => {
            const id = parseInt(key);
            if (id === 0) return; // Skip "None"
            const type = state.labelTypes[id];
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${id}. ${type.name}`;
            opt.style.color = type.color;
            opt.style.fontWeight = 'bold';
            if (currentVal === String(id)) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }
}

function renderAnalysisTable(forceRebuild = false) {
    if (!window.analysisData) window.analysisData = [];

    // Ensure the filter dropdown is synchronized with active classes
    updateTableClassFilterDropdown();

    // Get active filter value
    const select = document.getElementById('tableClassFilter');
    const filterVal = select ? select.value : 'all';

    // Filter dynamic peak data
    let filteredData = window.analysisData;
    if (filterVal !== 'all') {
        const filterId = parseInt(filterVal);
        filteredData = window.analysisData.filter(row => row.label === filterId);
    }

    // Update the peak count label
    const countEl = document.getElementById("peak-count");
    if (countEl) {
        if (filterVal !== 'all') {
            countEl.textContent = `Showing ${filteredData.length} of ${window.analysisData.length} regions`;
        } else {
            countEl.textContent = `${window.analysisData.length} regions`;
        }
    }

    // Calculate Best Units for Physics Columns (from entire window.analysisData to keep units stable)
    // 1. Extract arrays
    const charges = window.analysisData.map(d => d.charge);
    const energies = window.analysisData.map(d => d.energy);
    const energyEVs = window.analysisData.map(d => d.energyEV);

    // 2. Get Scale Factors
    const qUnit = window.calculateColumnUnit ? window.calculateColumnUnit(charges) : { scale: 1e9, prefix: 'n' };
    const eUnit = window.calculateColumnUnit ? window.calculateColumnUnit(energies) : { scale: 1e12, prefix: 'p' };
    const evUnit = window.calculateColumnUnit ? window.calculateColumnUnit(energyEVs) : { scale: 1, prefix: '' };

    // Prepare data for DataTables from filteredData
    const tableData = filteredData.map(row => {
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
            fwhm: roundToPrecision(row.fwhm),
            maxVal: roundToPrecision(row.maxVal),
            area: roundToPrecision(row.area),
            sumVSq: roundToPrecision(row.sumVSq),

            // Numeric Scaled Values
            charge: roundToPrecision(row.charge * qUnit.scale),
            energy: roundToPrecision(row.energy * eUnit.scale),
            energyEV: roundToPrecision(row.energyEV * evUnit.scale),

            rawLabel: row.label,
            DT_RowId: `row_${row.id}`
        };
    });

    // Column Definitions with Dynamic Headers
    const columns = [
        { data: 'id', title: 'ID' },
        { data: 'className', title: 'Class' },
        { data: 'start', title: 'Start' },
        { data: 'end', title: 'End' },
        { data: 'width', title: 'Width (N)' },
        { data: 'fwhm', title: 'FWHM' },
        { data: 'maxVal', title: 'Max Voltage', className: 'text-peak-color' },
        { data: 'area', title: '∑(V) (V·s)' },
        { data: 'sumVSq', title: '∑(V²) (V²·s)' },
        { data: 'charge', title: `Charge (${qUnit.prefix}C)` },
        { data: 'energy', title: `Energy (${eUnit.prefix}J)` },
        { data: 'energyEV', title: `Energy (${evUnit.prefix}eV)` }
    ];

    // Check if we need to rebuild the table (if headers changed)
    const prevUnits = state.lastAnalysisUnits || {};
    const unitsChanged = prevUnits.q !== qUnit.prefix || prevUnits.e !== eUnit.prefix || prevUnits.ev !== evUnit.prefix;

    // Update state
    state.lastAnalysisUnits = { q: qUnit.prefix, e: eUnit.prefix, ev: evUnit.prefix };

    if ($.fn.DataTable.isDataTable('#analysisTable')) {
        let dt = $('#analysisTable').DataTable();

        if (unitsChanged || forceRebuild) {
            // Full Rebuild required if headers change OR forced
            dt.destroy();
            $('#analysisTable').empty(); // Remove old headers
            initDataTable(tableData, columns);
        } else {
            // Fast Update (Data only)
            dt.clear();
            dt.rows.add(tableData);
            dt.draw(false); // false = preserve paging
        }
    } else {
        // First Init
        initDataTable(tableData, columns);
    }
}

function initDataTable(data, columns) {
    $('#analysisTable').DataTable({
        data: data,
        columns: columns,
        paging: true,
        pageLength: 5,
        lengthMenu: [5, 10, 20, 50],
        lengthChange: true,
        scrollY: false,
        scrollCollapse: true,
        searching: false,
        ordering: true,
        info: true,
        autoWidth: false,
        destroy: true, // Ensure we can destroy later
        language: {
            emptyTable: "No labeled regions found. Use 'Manage Classes' to add labels."
        },
        createdRow: function (row, data, dataIndex) {
            $(row).on('click', function () {
                if (window.jumpToCallback) window.jumpToCallback(data.start, data.end);
            });
        }
    });
}

function showPeakDistributions(e) {
    // Robust event handling
    if (e && e.stopPropagation) {
        e.stopPropagation();
    } else if (window.event) {
        window.event.cancelBubble = true;
    }

    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");

    if (!window.analysisData || window.analysisData.length === 0) {
        if (window.updatePeakAnalysis) window.updatePeakAnalysis();
    }

    if (!window.analysisData || window.analysisData.length === 0) return alert("No peaks found to analyze.");

    if (window.openModal) window.openModal('peakDistModal');

    // Populate pills dynamically!
    if (window.renderDistClassPills) window.renderDistClassPills();

    setTimeout(() => {
        const types = [
            { key: 'width', inputId: 'binsWidth', dataFn: d => d.width },
            { key: 'fwhm', inputId: 'binsFWHM', dataFn: d => d.fwhm },
            { key: 'voltage', inputId: 'binsVoltage', dataFn: d => d.maxVal },
            { key: 'area', inputId: 'binsArea', dataFn: d => d.area },
            { key: 'sumVSq', inputId: 'binsSumVSq', dataFn: d => d.sumVSq },
            { key: 'charge', inputId: 'binsCharge', dataFn: d => d.charge },
            { key: 'energy', inputId: 'binsEnergy', dataFn: d => d.energy },
            { key: 'energyEV', inputId: 'binsEnergyEV', dataFn: d => d.energyEV }
        ];

        types.forEach(type => {
            const values = window.analysisData.map(type.dataFn);
            let optimalBins = 20;
            if (window.calculateOptimalBins) {
                try {
                    optimalBins = window.calculateOptimalBins(values);
                } catch (err) { console.error(err); }
            }

            const input = document.getElementById(type.inputId);
            if (input) input.value = optimalBins;

            if (window.updateSingleDistChart) {
                window.updateSingleDistChart(type.key);
            }
        });
    }, 100);
}

// Global exposure
window.renderAnalysisTable = renderAnalysisTable;
window.showPeakDistributions = showPeakDistributions;
window.updateTableClassFilterDropdown = updateTableClassFilterDropdown;

