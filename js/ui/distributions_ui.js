/**
 * UI: Peak Distribution Charts
 * ─────────────────────────────
 * Dağılım grafikleri (distribution charts) için veri hazırlama ve güncelleme.
 *
 * ─── Dağılım Tipleri ve Fiziksel Anlamları ──────────────────────
 *
 * width     : Bölge genişliği (sample sayısı), birim: N (boyutsuz)
 * fwhm      : Yarı yükseklikte tam genişlik (sample), birim: N
 * voltage   : Bölgedeki maksimum gerilim, birim: V (Volt)
 * area      : ∑(V-baseline), birim: V (toplam gerilim farkı)
 * sumVSq    : ∑(V-baseline)², birim: V²
 * charge    : Q = ∑V × dt / R, birim: C (Coulomb)
 * energy    : E = ∑V² × dt / R, birim: J (Joule)
 * energyEV  : E / e, birim: eV (elektron-volt)
 *
 * İstatistiksel yöntemler: statistics.js (KDE, Freedman-Diaconis)
 */

/**
 * Birim kısa adı mapping'i — xTitle'dan base unit'e
 */
const DIST_UNIT_MAP = {
    'Volts': 'V',
    'V·s': 'V·s',
    'V²·s': 'V²·s',
    'Coulombs': 'C',
    'Joules': 'J',
    'eV': 'eV',
    'Samples': null   // ölçekleme yapma
};

function renderDistClassPills() {
    const container = document.getElementById('distClassPills');
    if (!container) return;

    // Get current selections if pills already exist, or default to select all
    const activeIds = new Set();
    const pills = container.querySelectorAll('.class-pill');
    if (pills.length > 0) {
        pills.forEach(p => {
            const cb = p.querySelector('input');
            if (cb && cb.checked) activeIds.add(parseInt(cb.value));
        });
    } else {
        // First time opening: select all available classes in state
        Object.keys(state.labelTypes).forEach(key => {
            const id = parseInt(key);
            if (id !== 0) activeIds.add(id);
        });
    }

    container.innerHTML = '';

    // Populate from state.labelTypes
    Object.keys(state.labelTypes).forEach(key => {
        const id = parseInt(key);
        if (id === 0) return; // Skip "None"
        const type = state.labelTypes[id];

        const label = document.createElement('label');
        label.className = 'class-pill';
        
        const isChecked = activeIds.has(id);
        if (isChecked) {
            label.classList.add('active');
            label.style.color = type.color;
        } else {
            label.style.color = 'var(--text-muted)';
        }

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = id;
        input.checked = isChecked;
        input.className = 'dist-class-checkbox';
        
        input.onchange = function() {
            if (this.checked) {
                label.classList.add('active');
                label.style.color = type.color;
            } else {
                label.classList.remove('active');
                label.style.color = 'var(--text-muted)';
            }
            // Update all charts
            updateAllDistCharts();
        };

        const dot = document.createElement('span');
        dot.className = 'class-pill-dot';
        dot.style.backgroundColor = type.color;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${id}. ${type.name}`;

        label.appendChild(input);
        label.appendChild(dot);
        label.appendChild(nameSpan);
        container.appendChild(label);
    });
}

function toggleAllDistClasses(selectAll) {
    const container = document.getElementById('distClassPills');
    if (!container) return;

    const pills = container.querySelectorAll('.class-pill');
    pills.forEach(p => {
        const input = p.querySelector('input');
        if (input) {
            input.checked = selectAll;
            const id = parseInt(input.value);
            const type = state.labelTypes[id];
            if (selectAll) {
                p.classList.add('active');
                p.style.color = type ? type.color : 'var(--text-main)';
            } else {
                p.classList.remove('active');
                p.style.color = 'var(--text-muted)';
            }
        }
    });
    
    // Update all charts
    updateAllDistCharts();
}

function updateAllDistCharts() {
    const types = ['width', 'fwhm', 'voltage', 'area', 'sumVSq', 'charge', 'energy', 'energyEV'];
    types.forEach(type => {
        updateSingleDistChart(type);
    });
}

function showEmptyDistChart(containerId, title) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="chart-empty-msg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 8px; opacity: 0.5;">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <span>No data matching selected classes for ${title}</span>
            </div>
        `;
    }
}

function updateSingleDistChart(type) {
    if (!window.analysisData || window.analysisData.length === 0) return;

    // Get active selected label IDs from dynamic pills
    const selectedLabels = [];
    const container = document.getElementById('distClassPills');
    if (container) {
        const checkboxes = container.querySelectorAll('.dist-class-checkbox:checked');
        checkboxes.forEach(cb => selectedLabels.push(parseInt(cb.value)));
    } else {
        // Fallback: use all classes except 0 if pills are not yet created
        Object.keys(state.labelTypes).forEach(key => {
            const id = parseInt(key);
            if (id !== 0) selectedLabels.push(id);
        });
    }

    // Filter peaks matching active pills
    const filteredPeaks = window.analysisData.filter(d => selectedLabels.includes(d.label));

    let containerId, title, xTitle, color, binInputId, baseUnit;
    let rawData = [];

    if (type === 'width') {
        rawData = filteredPeaks.map(d => d.width);
        containerId = 'distChartWidth'; title = 'Width Distribution'; xTitle = 'Samples'; color = '#00e676'; binInputId = 'binsWidth'; baseUnit = null;
    } else if (type === 'fwhm') {
        rawData = filteredPeaks.map(d => d.fwhm);
        containerId = 'distChartFWHM'; title = 'FWHM Distribution'; xTitle = 'Samples'; color = '#00bcd4'; binInputId = 'binsFWHM'; baseUnit = null;
    } else if (type === 'voltage') {
        rawData = filteredPeaks.map(d => d.maxVal);
        containerId = 'distChartVoltage'; title = 'Max Voltage Distribution'; xTitle = 'V'; color = '#e03f6f'; binInputId = 'binsVoltage'; baseUnit = 'V';
    } else if (type === 'area') {
        rawData = filteredPeaks.map(d => d.area);
        containerId = 'distChartArea'; title = '∑(V) Distribution'; xTitle = 'V·s'; color = '#ff9800'; binInputId = 'binsArea'; baseUnit = 'V·s';
    } else if (type === 'sumVSq') {
        rawData = filteredPeaks.map(d => d.sumVSq);
        containerId = 'distChartSumVSq'; title = '∑(V²) Distribution'; xTitle = 'V²·s'; color = '#9c27b0'; binInputId = 'binsSumVSq'; baseUnit = 'V²·s';
    } else if (type === 'charge') {
        rawData = filteredPeaks.map(d => d.charge);
        containerId = 'distChartCharge'; title = 'Charge (Q) Distribution'; xTitle = 'C'; color = '#009688'; binInputId = 'binsCharge'; baseUnit = 'C';
    } else if (type === 'energy') {
        rawData = filteredPeaks.map(d => d.energy);
        containerId = 'distChartEnergy'; title = 'Energy (J) Distribution'; xTitle = 'J'; color = '#ff5722'; binInputId = 'binsEnergy'; baseUnit = 'J';
    } else if (type === 'energyEV') {
        rawData = filteredPeaks.map(d => d.energyEV);
        containerId = 'distChartEnergyEV'; title = 'Energy (eV) Distribution'; xTitle = 'eV'; color = '#795548'; binInputId = 'binsEnergyEV'; baseUnit = 'eV';
    }

    if (rawData.length === 0) {
        showEmptyDistChart(containerId, title);
        return;
    }

    // SI prefix scaling (except Samples)
    let scaledData = rawData;
    if (baseUnit && rawData.length > 0 && window.calculateColumnUnit) {
        const unitInfo = calculateColumnUnit(rawData);
        if (unitInfo.scale !== 1) {
            scaledData = rawData.map(v => v * unitInfo.scale);
            xTitle = unitInfo.prefix + baseUnit;
        }
    }

    // Check log toggles
    let useLogX = false;
    let useLogY = false;
    
    let logxElem = document.getElementById('logx_' + type);
    if (logxElem) useLogX = logxElem.checked;
    
    let logyElem = document.getElementById('logy_' + type);
    if (logyElem) useLogY = logyElem.checked;

    let binElem = document.getElementById(binInputId);
    let binCount = parseInt(binElem.value) || 20;
    if (binCount > 1000) {
        binCount = 1000;
        binElem.value = 1000;
    }
    if (window.createDistributionChart) window.createDistributionChart(containerId, scaledData, title, xTitle, color, binCount, type, useLogX, useLogY);
}

// Global exposure
window.updateSingleDistChart = updateSingleDistChart;
window.renderDistClassPills = renderDistClassPills;
window.toggleAllDistClasses = toggleAllDistClasses;
window.updateAllDistCharts = updateAllDistCharts;
