/**
 * Matematiksel Yardımcı Fonksiyonlar — Lineer Cebir
 * ====================================================
 *
 * Bu modül, sinyal işleme ve istatistiksel analiz için gereken
 * temel matris işlemlerini içerir.
 *
 * ─── Matris Çarpımı ─────────────────────────────────────────────
 * İki matrisin çarpımı: C = A × B
 *   C[i][j] = Σ_k A[i][k] · B[k][j]
 *
 * Referans: Strang, G. "Introduction to Linear Algebra", 5th Ed., §1.4
 *
 * ─── Matris Tersi (Gauss-Jordan Eliminasyonu) ───────────────────
 * Bir A matrisinin tersi A⁻¹, şu özelliği sağlar: A · A⁻¹ = I
 * Gauss-Jordan eliminasyonu, [A | I] artırılmış matrisini satır
 * işlemleriyle [I | A⁻¹] formuna dönüştürür.
 *
 * Referans: Press et al., "Numerical Recipes", 3rd Ed., §2.1
 *
 * ─── Savitzky-Golay Katsayıları ─────────────────────────────────
 * Savitzky-Golay filtresi, bir pencere içindeki verilere en küçük
 * kareler yöntemiyle polinom uydurarak yumuşatma yapar.
 *
 * Teori:
 *   1. Vandermonde matrisi A oluşturulur: A[i][j] = i^j
 *      (i: pencere indeksi [-m, m], j: polinom derecesi [0, order])
 *   2. Normal denklemler: (AᵀA)c = Aᵀy
 *   3. Katsayılar: c = (AᵀA)⁻¹ · Aᵀ · y
 *   4. Filtrenin konvolüsyon ağırlıkları: (AᵀA)⁻¹Aᵀ matrisinin ilk satırı
 *
 * Referans:
 *   Savitzky, A.; Golay, M.J.E. (1964). "Smoothing and Differentiation
 *   of Data by Simplified Least Squares Procedures". Analytical Chemistry.
 *   36 (8): 1627–1639. doi:10.1021/ac60214a047
 */

/**
 * İki matrisin çarpımını hesaplar: C = A × B
 * @param {number[][]} A - m×n matris
 * @param {number[][]} B - n×p matris
 * @returns {number[][]} m×p sonuç matrisi
 */
function multiplyMatrices(A, B) {
    let result = new Array(A.length).fill(0).map(() => new Array(B[0].length).fill(0));
    return result.map((row, i) => {
        return row.map((val, j) => {
            return A[i].reduce((sum, elm, k) => sum + (elm * B[k][j]), 0);
        });
    });
}

/**
 * Gauss-Jordan eliminasyonu ile matris tersini hesaplar.
 * @param {number[][]} M - n×n kare matris
 * @returns {number[][]} M⁻¹ ters matris
 */
function invertMatrix(M) {
    let n = M.length;
    let A = JSON.parse(JSON.stringify(M));
    let I = [];
    for (let i = 0; i < n; i++) {
        I[i] = [];
        for (let j = 0; j < n; j++) I[i][j] = (i === j) ? 1 : 0;
    }

    for (let i = 0; i < n; i++) {
        let piv = A[i][i];
        for (let j = 0; j < n; j++) { A[i][j] /= piv; I[i][j] /= piv; }
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                let f = A[k][i];
                for (let j = 0; j < n; j++) { A[k][j] -= f * A[i][j]; I[k][j] -= f * I[i][j]; }
            }
        }
    }
    return I;
}

/**
 * Savitzky-Golay filtre katsayılarını hesaplar.
 *
 * Vandermonde matrisi kullanarak en küçük kareler polinom uyduması yapar
 * ve konvolüsyon ağırlıklarını döndürür.
 *
 * @param {number} m - Yarı pencere genişliği (pencere = 2m+1)
 * @param {number} order - Polinom derecesi
 * @returns {number[]} Konvolüsyon ağırlıkları (2m+1 uzunluk)
 */
function calcSGWeights(m, order) {
    const size = 2 * m + 1;

    // Vandermonde matrisi: A[i][j] = i^j, i ∈ [-m, m]
    let A = [];
    for (let i = -m; i <= m; i++) {
        let row = [];
        for (let j = 0; j <= order; j++) {
            row.push(Math.pow(i, j));
        }
        A.push(row);
    }

    // Normal denklemlerin çözümü: c = (AᵀA)⁻¹ · Aᵀ
    let AT = A[0].map((_, c) => A.map(r => r[c]));
    let ATA = multiplyMatrices(AT, A);
    let ATAInv = invertMatrix(ATA);
    let coeffs = multiplyMatrices(ATAInv, AT);

    // İlk satır = yumuşatma katsayıları (0. türev)
    return coeffs[0];
}

// Global exposure
window.multiplyMatrices = multiplyMatrices;
window.invertMatrix = invertMatrix;
window.calcSGWeights = calcSGWeights;
