/**
 * Fiziksel Sabitler ve SI Birim Çarpanları
 * =========================================
 *
 * Bu modül, projede kullanılan tüm fiziksel sabitleri ve birim
 * dönüşüm çarpanlarını merkezi bir yerde toplar.
 *
 * Referans: NIST CODATA 2018 Recommended Values
 * https://physics.nist.gov/cuu/Constants/
 *
 * SI Ön Ekleri (Prefix):
 *   Referans: Bureau International des Poids et Mesures (BIPM)
 *   https://www.bipm.org/en/measurement-units/si-prefixes
 */

// ─── Fiziksel Sabitler ───────────────────────────────────────────────
const PHYSICS_CONSTANTS = Object.freeze({
    /**
     * Elektron yükü (temel yük birimi)
     * e = 1.602 176 634 × 10⁻¹⁹ C
     * CODATA 2018'den itibaren TAM (exact) değer olarak tanımlanmıştır.
     * Referans: NIST SP 961, Resolution 1 of the 26th CGPM (2018)
     */
    ELECTRON_CHARGE: 1.602176634e-19, // Coulomb

    /**
     * Boltzmann sabiti
     * k_B = 1.380 649 × 10⁻²³ J/K
     * CODATA 2018 tam değer.
     */
    BOLTZMANN: 1.380649e-23, // J/K

    /**
     * Planck sabiti
     * h = 6.626 070 15 × 10⁻³⁴ J·s
     * CODATA 2018 tam değer.
     */
    PLANCK: 6.62607015e-34 // J·s
});

// ─── SI Birim Ön Ekleri ──────────────────────────────────────────────
/**
 * SI Ön Ekleri ve Çarpanları
 *
 * Uluslararası Birimler Sistemi (SI), büyüklükleri ifade etmek için
 * standart ön ekler tanımlar. Örneğin:
 *   1 ns = 1 × 10⁻⁹ s (nano-saniye)
 *   1 kΩ = 1 × 10³ Ω  (kilo-ohm)
 *
 * Referans: BIPM SI Brochure, 9th Edition (2019), Table 7
 */
const SI_PREFIXES = Object.freeze({
    'f': 1e-15,  // femto
    'p': 1e-12,  // piko
    'n': 1e-9,   // nano
    'u': 1e-6,   // mikro (ASCII karşılığı)
    'µ': 1e-6,   // mikro (Unicode)
    'm': 1e-3,   // mili
    'c': 1e-2,   // santi
    'd': 1e-1,   // desi
    '': 1,      // (birim)
    'k': 1e3,    // kilo
    'M': 1e6,    // mega
    'G': 1e9,    // giga
    'T': 1e12    // tera
});

/**
 * Temel (base) birimler — çarpanı 1 olan birimler.
 * getMultiplier() fonksiyonunda kullanılır.
 */
const BASE_UNITS = Object.freeze([
    'ohm', 'Ω', 's', 'eV', 'V', 'J', 'C', 'A', 'Hz'
]);

/**
 * Birim gösteriminde kullanılan sıralı ön ek listesi.
 * formatMetric() ve calculateColumnUnit() için.
 */
const PREFIX_SCALE_TABLE = Object.freeze([
    { limit: 1e12, prefix: 'T' },
    { limit: 1e9, prefix: 'G' },
    { limit: 1e6, prefix: 'M' },
    { limit: 1e3, prefix: 'k' },
    { limit: 1, prefix: '' },
    { limit: 1e-3, prefix: 'm' },
    { limit: 1e-6, prefix: 'µ' },
    { limit: 1e-9, prefix: 'n' },
    { limit: 1e-12, prefix: 'p' },
    { limit: 1e-15, prefix: 'f' }
]);

// ─── Osiloskop Sabitleri ─────────────────────────────────────────────
/**
 * Ekrandaki yatay bölme (division) sayısı.
 * Siglent SDS serisi osiloskoplarda ekran 15.2 yatay division'a bölünür.
 * DT hesabında kullanılır: DT = SCOPE_DIVS_HORIZONTAL * timebase_scale / sample_fullscreen
 */
const SCOPE_DIVS_HORIZONTAL = 15.2;

// Global exposure
window.PHYSICS_CONSTANTS = PHYSICS_CONSTANTS;
window.SI_PREFIXES = SI_PREFIXES;
window.BASE_UNITS = BASE_UNITS;
window.PREFIX_SCALE_TABLE = PREFIX_SCALE_TABLE;
window.SCOPE_DIVS_HORIZONTAL = SCOPE_DIVS_HORIZONTAL;
