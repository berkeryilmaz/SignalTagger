/**
 * Fizik Hesaplamaları — Puls (Pulse) Analizi
 * =============================================
 *
 * Bu modül, sinyal bölgelerinden fiziksel büyüklüklerin hesaplanmasını
 * sağlar. Hesaplamalar, bir direnç üzerinde ölçülen gerilim sinyalinden
 * yük ve enerji çıkarımına dayanır.
 *
 * ─── Teori: Ohm Yasası ve Güç Denklemleri ───────────────────────
 *
 * Bir R direnci üzerinde V(t) gerilimi ölçüldüğünde:
 *
 *   Akım:    I(t) = V(t) / R                    [Ohm Yasası]
 *   Güç:     P(t) = V(t) · I(t) = V²(t) / R    [Anlık güç]
 *
 * Referans: Griffiths, D.J. "Introduction to Electrodynamics",
 *           4th Edition, Cambridge University Press, 2017, §7.1
 *
 * ─── Yük Hesabı (Coulomb) ───────────────────────────────────────
 *
 *   Q = ∫ I(t) dt = ∫ V(t)/R dt
 *
 * Dijital sinyal için sayısal integrasyon (Riemann toplamı):
 *   Q ≈ Σ V(tᵢ) · Δt / R
 *
 * Burada:
 *   V(tᵢ) = her örnekleme noktasındaki gerilim (baseline düşülmüş)
 *   Δt    = örnekleme aralığı (time step)
 *   R     = ölçüm direnci
 *
 * Referans: Serway, R.A. & Jewett, J.W. "Physics for Scientists
 *           and Engineers", 10th Edition, Cengage, 2019, Ch. 26
 *
 * ─── Enerji Hesabı (Joule) ─────────────────────────────────────
 *
 *   E = ∫ P(t) dt = ∫ V²(t)/R dt
 *   E ≈ Σ V²(tᵢ) · Δt / R
 *
 * Bu, dirençte harcanan toplam enerjidir (Joule ısınması).
 *
 * Referans: Halliday, D.; Resnick, R.; Walker, J.
 *           "Fundamentals of Physics", 11th Ed., Wiley, 2018, Ch. 26
 *
 * ─── Enerji Dönüşümü (eV) ──────────────────────────────────────
 *
 *   E(eV) = E(J) / e
 *
 * Burada e = 1.602 176 634 × 10⁻¹⁹ C (temel yük birimi)
 * Elektron-volt, bir elektronun 1 V potansiyel farkı ile kazandığı
 * kinetik enerjidir. Parçacık fiziğinde yaygın kullanılır.
 *
 * Referans: NIST SP 961, CODATA 2018 Recommended Values
 *           https://physics.nist.gov/cgi-bin/cuu/Value?e
 *
 * ─── FWHM (Yarı Yükseklikte Tam Genişlik) ──────────────────────
 *
 * FWHM (Full Width at Half Maximum), bir tepenin maksimum değerinin
 * yarısındaki genişliğidir. Puls şekli karakterizasyonunda standart
 * ölçüdür.
 *
 *   halfMax = (maxVal - baseline) / 2 + baseline
 *
 * Sol ve sağ geçiş noktaları lineer interpolasyon ile bulunur:
 *   x_cross = x₁ + (halfMax - y₁) / (y₂ - y₁)
 *
 * Gaussian tepeler için: FWHM = 2√(2 ln 2) · σ ≈ 2.3548 · σ
 *
 * Referans: Bevington, P.R. & Robinson, D.K. "Data Reduction and
 *           Error Analysis for the Physical Sciences", 3rd Ed.,
 *           McGraw-Hill, 2003, §6.4
 */

/**
 * Bir bölgedeki FWHM'i hesaplar.
 *
 * @param {Float32Array|number[]} data   - Sinyal verisi
 * @param {number}                start  - Bölge başlangıç indeksi
 * @param {number}                end    - Bölge bitiş indeksi
 * @param {number}                maxVal - Bölgedeki maksimum değer
 * @param {number}                maxIdx - Maksimum değerin indeksi
 * @param {number}                base   - Baseline değeri
 * @returns {number} FWHM (örnekleme noktası cinsinden)
 */
function calculateFWHM(data, start, end, maxVal, maxIdx, base) {
    if (maxIdx === -1) return 0;

    let halfMax = (maxVal - base) / 2 + base;

    // Sol geçiş noktasını bul
    let leftIdx = maxIdx;
    while (leftIdx > start && data[leftIdx] > halfMax) {
        leftIdx--;
    }

    // Sol lineer interpolasyon
    let fwhmStart = leftIdx;
    if (data[leftIdx] <= halfMax && data[leftIdx + 1] > halfMax) {
        let v1 = data[leftIdx];
        let v2 = data[leftIdx + 1];
        fwhmStart = leftIdx + (halfMax - v1) / (v2 - v1);
    }

    // Sağ geçiş noktasını bul
    let rightIdx = maxIdx;
    while (rightIdx < end && data[rightIdx] > halfMax) {
        rightIdx++;
    }

    // Sağ lineer interpolasyon
    let fwhmEnd = rightIdx;
    if (data[rightIdx] <= halfMax && data[rightIdx - 1] > halfMax) {
        let v1 = data[rightIdx - 1];
        let v2 = data[rightIdx];
        fwhmEnd = (rightIdx - 1) + (halfMax - v1) / (v2 - v1);
    }

    let fwhm = fwhmEnd - fwhmStart;
    return fwhm < 0 ? 0 : fwhm;
}

/**
 * Bir bölge için fiziksel büyüklükleri hesaplar.
 *
 * @param {object} regionStats - Bölge istatistikleri { area, sumVSq }
 * @param {object} physicsParams - Fizik parametreleri { R, dt }
 * @returns {object} { charge, energy, energyEV }
 */
function calculatePhysicsMetrics(regionStats, physicsParams) {
    const { area, sumVSq } = regionStats;
    const { R, dt } = physicsParams;

    let charge = 0;
    let energy = 0;
    let energyEV = 0;

    if (R > 0) {
        // Q = Σ V(tᵢ) · Δt / R   [Coulomb]
        charge = (area * dt) / R;

        // E = Σ V²(tᵢ) · Δt / R  [Joule]
        energy = (sumVSq * dt) / R;

        // E(eV) = E(J) / e
        energyEV = energy / PHYSICS_CONSTANTS.ELECTRON_CHARGE;
    }

    return { charge, energy, energyEV };
}

/**
 * state.physics'ten gerçek SI değerlerini (R ve dt) çıkarır.
 *
 * @returns {object} { R, dt } — SI birimleri cinsinden (Ω, s)
 */
function getPhysicsParams() {
    const R_val = state.physics.R;
    const R_mult = getMultiplier(state.physics.R_unit);
    const R = R_val * R_mult;

    const dt_val = state.physics.dt;
    const dt_mult = getMultiplier(state.physics.dt_unit);
    const dt = dt_val * dt_mult;

    return { R, dt };
}

// Global exposure
window.calculateFWHM = calculateFWHM;
window.calculatePhysicsMetrics = calculatePhysicsMetrics;
window.getPhysicsParams = getPhysicsParams;
