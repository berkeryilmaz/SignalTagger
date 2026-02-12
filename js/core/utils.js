// Core Utils

function roundToPrecision(num) {
    let factor = Math.pow(10, state.dataPrecision);
    return Math.round(num * factor) / factor;
}

function getThemeColors() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    return {
        bg: isLight ? '#ffffff' : '#1e1e1e', // Card BG
        plotBg: isLight ? '#ffffff' : '#1e1e1e',
        text: isLight ? '#1f2937' : '#e0e0e0',
        textMuted: isLight ? '#6b7280' : '#a0a0a0',
        grid: isLight ? '#e5e7eb' : '#333',
        axisLine: isLight ? '#d1d5db' : '#555',
        tooltipBg: isLight ? '#ffffff' : '#000000',
        tooltipText: isLight ? '#000000' : '#ffffff',
        derivColor: isLight ? '#c2410c' : '#d97706',
        smoothColor: isLight ? '#059669' : '#00e676',
        histoColor: isLight ? '#7c3aed' : '#7c4dff'
    };
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

window.roundToPrecision = roundToPrecision;
window.getThemeColors = getThemeColors;
window.getRandomColor = getRandomColor;
