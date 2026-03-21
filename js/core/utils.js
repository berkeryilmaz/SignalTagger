/**
 * Yardımcı Fonksiyonlar (Utils)
 * ===============================
 *
 * Genel amaçlı yardımcı fonksiyonlar. Birim çarpanları ve
 * ön ek tabloları constants.js'den alınır.
 */

// Core Utils

function roundToPrecision(num) {
    let factor = Math.pow(10, state.dataPrecision);
    return Math.round(num * factor) / factor;
}

function getThemeColors() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    return {
        bg: isLight ? '#ffffff' : '#1e1e1e',
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

/**
 * Birim string'inden SI çarpanını döndürür.
 * SI_PREFIXES ve BASE_UNITS constants.js'den alınır.
 */
function getMultiplier(unit) {
    if (!unit) return 1;

    // 1. SI ön eki olarak eşleşme (constants.js)
    if (SI_PREFIXES.hasOwnProperty(unit)) return SI_PREFIXES[unit];

    // 2. Temel birim kontrolü (constants.js)
    if (BASE_UNITS.includes(unit)) return 1;

    // 3. String'in ilk karakterinden ön ek çıkar (ör: "ns" → "n")
    const firstChar = unit.charAt(0);
    if (SI_PREFIXES.hasOwnProperty(firstChar)) {
        return SI_PREFIXES[firstChar];
    }

    return 1;
}

/**
 * Değeri okunabilir birim string'ine dönüştürür.
 * PREFIX_SCALE_TABLE constants.js'den alınır.
 */
function formatMetric(value, baseUnit) {
    if (value === 0) return `0 ${baseUnit}`;

    const absVal = Math.abs(value);

    for (let i = 0; i < PREFIX_SCALE_TABLE.length; i++) {
        if (absVal >= PREFIX_SCALE_TABLE[i].limit) {
            let scaled = value / PREFIX_SCALE_TABLE[i].limit;
            return `${scaled.toFixed(3)} ${PREFIX_SCALE_TABLE[i].prefix}${baseUnit}`;
        }
    }
    return `${value.toExponential(2)} ${baseUnit}`;
}

window.getMultiplier = getMultiplier;
window.formatMetric = formatMetric;

/**
 * Bir sütundaki değerler için en uygun birim ölçeğini hesaplar.
 * PREFIX_SCALE_TABLE constants.js'den alınır.
 */
function calculateColumnUnit(values) {
    let max = 0;
    for (let v of values) {
        if (Math.abs(v) > max) max = Math.abs(v);
    }

    if (max === 0) return { scale: 1, prefix: '' };

    for (let i = 0; i < PREFIX_SCALE_TABLE.length; i++) {
        if (max >= PREFIX_SCALE_TABLE[i].limit) {
            return { scale: 1 / PREFIX_SCALE_TABLE[i].limit, prefix: PREFIX_SCALE_TABLE[i].prefix };
        }
    }
    return { scale: 1, prefix: '' };
}
window.calculateColumnUnit = calculateColumnUnit;

/**
 * ADC Ham Değer → Gerilim (Volt) Dönüşümü
 * ─────────────────────────────────────────
 * OWON XDS 3302 osiloskop ekranı:
 *   Dikey: 10 division (5 yukarı + 5 aşağı, merkez = 0)
 *   ADC:   12-bit signed → [-2048, 2047] aralığı
 *
 * Dönüşüm formülü:
 *   V = (raw × 5/2048 − offset × 2/100) × voltageScale × probeMultiplier
 *
 *   raw × 5/2048    : Ham ADC değerini division birimine çevirir.
 *                     5 = yarı ekranın division sayısı (yukarı yönde)
 *                     2048 = 12-bit signed ADC'nin yarı aralığı (2^11)
 *                     Ekranın tam ortası raw=0, tepesi raw=2047, altı raw=-2048.
 *
 *   offset × 2/100  : Kanal DC ofsetini division birimine çevirir.
 *                     Osiloskop, offset değerini yüzde olarak kodlar:
 *                     %100 = 2 division kayma.
 *
 *   voltageScale     : V/div — her bir division'ın Volt karşılığı.
 *
 *   probeMultiplier  : Prob/yükselteç çarpanı.
 *                     Sinyalin kaç kat yükseltildiğini belirtir.
 *
 * Referans: OWON XDS 3302 User Manual, ADC Data Format
 *
 * @param {number} raw             - Ham ADC değeri (12-bit signed, [-2048, 2047])
 * @param {number} offset          - Kanal ofseti (osiloskop biriminde, %)
 * @param {number} voltageScale    - Dikey ölçek (V/div)
 * @param {number} probeMultiplier - Prob/yükselteç çarpanı
 * @returns {number} Gerilim değeri (Volt)
 */
function rawToVoltage(raw, offset, voltageScale, probeMultiplier) {
    // division = raw × (dikey_yarı_div / ADC_yarı_aralık) = raw × 5 / 2048
    const halfDivs = SCOPE_DIVS_VERTICAL / 2;  // 5
    const rawInDivs = raw * halfDivs / ADC_HALF_RANGE;

    // Offset dönüşümü: offset × 2/100 → division
    const offsetInDivs = offset * OFFSET_SCALE_FACTOR;

    // Sonuç: (division − offset_division) × V/div × prob_çarpanı
    return (rawInDivs - offsetInDivs) * voltageScale * probeMultiplier;
}

window.rawToVoltage = rawToVoltage;
window.roundToPrecision = roundToPrecision;
window.getThemeColors = getThemeColors;
window.getRandomColor = getRandomColor;
