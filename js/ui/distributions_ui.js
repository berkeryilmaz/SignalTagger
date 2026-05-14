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

function updateSingleDistChart(type) {
    if (analysisData.length === 0) return;

    let data, containerId, title, xTitle, color, binInputId, baseUnit;

    if (type === 'width') {
        data = analysisData.map(d => d.width);
        containerId = 'distChartWidth'; title = 'Width Distribution'; xTitle = 'Samples'; color = '#00e676'; binInputId = 'binsWidth'; baseUnit = null;
    } else if (type === 'fwhm') {
        data = analysisData.map(d => d.fwhm);
        containerId = 'distChartFWHM'; title = 'FWHM Distribution'; xTitle = 'Samples'; color = '#00bcd4'; binInputId = 'binsFWHM'; baseUnit = null;
    } else if (type === 'voltage') {
        data = analysisData.map(d => d.maxVal);
        containerId = 'distChartVoltage'; title = 'Max Voltage Distribution'; xTitle = 'V'; color = '#e03f6f'; binInputId = 'binsVoltage'; baseUnit = 'V';
    } else if (type === 'area') {
        data = analysisData.map(d => d.area);
        containerId = 'distChartArea'; title = '∑(V) Distribution'; xTitle = 'V·s'; color = '#ff9800'; binInputId = 'binsArea'; baseUnit = 'V·s';
    } else if (type === 'sumVSq') {
        data = analysisData.map(d => d.sumVSq);
        containerId = 'distChartSumVSq'; title = '∑(V²) Distribution'; xTitle = 'V²·s'; color = '#9c27b0'; binInputId = 'binsSumVSq'; baseUnit = 'V²·s';
    } else if (type === 'charge') {
        data = analysisData.map(d => d.charge);
        containerId = 'distChartCharge'; title = 'Charge (Q) Distribution'; xTitle = 'C'; color = '#009688'; binInputId = 'binsCharge'; baseUnit = 'C';
    } else if (type === 'energy') {
        data = analysisData.map(d => d.energy);
        containerId = 'distChartEnergy'; title = 'Energy (J) Distribution'; xTitle = 'J'; color = '#ff5722'; binInputId = 'binsEnergy'; baseUnit = 'J';
    } else if (type === 'energyEV') {
        data = analysisData.map(d => d.energyEV);
        containerId = 'distChartEnergyEV'; title = 'Energy (eV) Distribution'; xTitle = 'eV'; color = '#795548'; binInputId = 'binsEnergyEV'; baseUnit = 'eV';
    }

    // SI ön eki ile ölçekleme (Samples hariç)
    let scaledData = data;
    if (baseUnit && data.length > 0 && window.calculateColumnUnit) {
        const unitInfo = calculateColumnUnit(data);
        if (unitInfo.scale !== 1) {
            scaledData = data.map(v => v * unitInfo.scale);
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

    let binCount = parseInt(document.getElementById(binInputId).value) || 20;
    if (window.createDistributionChart) window.createDistributionChart(containerId, scaledData, title, xTitle, color, binCount, type, useLogX, useLogY);
}

window.updateSingleDistChart = updateSingleDistChart;
