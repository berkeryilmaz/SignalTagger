// UI: Peak Distribution Charts
// Dağılım grafikleri (distribution charts) için veri hazırlama ve güncelleme.

function updateSingleDistChart(type) {
    if (analysisData.length === 0) return;

    let data, containerId, title, xTitle, color, binInputId;

    if (type === 'width') {
        data = analysisData.map(d => d.width);
        containerId = 'distChartWidth'; title = 'Width Distribution'; xTitle = 'Samples'; color = '#00e676'; binInputId = 'binsWidth';
    } else if (type === 'fwhm') {
        data = analysisData.map(d => d.fwhm);
        containerId = 'distChartFWHM'; title = 'FWHM Distribution'; xTitle = 'Samples'; color = '#00bcd4'; binInputId = 'binsFWHM';
    } else if (type === 'voltage') {
        data = analysisData.map(d => d.maxVal);
        containerId = 'distChartVoltage'; title = 'Max Voltage Distribution'; xTitle = 'Volts'; color = '#e03f6f'; binInputId = 'binsVoltage';
    } else if (type === 'area') {
        data = analysisData.map(d => d.area);
        containerId = 'distChartArea'; title = '∑(V) Distribution'; xTitle = 'V·s'; color = '#ff9800'; binInputId = 'binsArea';
    } else if (type === 'sumVSq') {
        data = analysisData.map(d => d.sumVSq);
        containerId = 'distChartSumVSq'; title = '∑(V²) Distribution'; xTitle = 'V²·s'; color = '#9c27b0'; binInputId = 'binsSumVSq';
    } else if (type === 'charge') {
        data = analysisData.map(d => d.charge);
        containerId = 'distChartCharge'; title = 'Charge (Q) Distribution'; xTitle = 'Coulombs'; color = '#009688'; binInputId = 'binsCharge';
    } else if (type === 'energy') {
        data = analysisData.map(d => d.energy);
        containerId = 'distChartEnergy'; title = 'Energy (J) Distribution'; xTitle = 'Joules'; color = '#ff5722'; binInputId = 'binsEnergy';
    } else if (type === 'energyEV') {
        data = analysisData.map(d => d.energyEV);
        containerId = 'distChartEnergyEV'; title = 'Energy (eV) Distribution'; xTitle = 'eV'; color = '#795548'; binInputId = 'binsEnergyEV';
    }

    let binCount = parseInt(document.getElementById(binInputId).value) || 20;
    if (window.createDistributionChart) window.createDistributionChart(containerId, data, title, xTitle, color, binCount, type);
}

window.updateSingleDistChart = updateSingleDistChart;
