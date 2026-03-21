/**
 * İstatistiksel Hesaplama Modülü
 * ================================
 *
 * Bu modül, histogram analizi ve dağılım karakterizasyonu için
 * kullanılan istatistiksel yöntemleri içerir.
 *
 * ─── Levenberg-Marquardt Algoritması (Gaussian Fit) ─────────────
 *
 * Doğrusal olmayan en küçük kareler optimizasyonu.
 * Gauss fonksiyonuna uydurmak için kullanılır:
 *
 *   f(x) = A · exp(-(x - μ)² / (2σ²))
 *
 * Parametre güncelleme kuralı:
 *   (JᵀJ + λ·diag(JᵀJ)) · Δp = Jᵀ · r
 *
 * Burada:
 *   J = Jacobian matrisi (kısmi türevler)
 *   r = artık vektör (residuals)
 *   λ = sönümleme faktörü (damping)
 *     - Hata azalırsa: λ /= 10 (Newton adımına yaklaş)
 *     - Hata artarsa:  λ *= 10 (gradient descent'e yaklaş)
 *
 * Jacobian bileşenleri:
 *   ∂f/∂A     = exp(-(x-μ)²/(2σ²))
 *   ∂f/∂μ     = A·exp(…)·(x-μ)/σ²
 *   ∂f/∂σ     = A·exp(…)·(x-μ)²/σ³
 *
 * Referans:
 *   Marquardt, D.W. (1963). "An Algorithm for Least-Squares Estimation
 *   of Nonlinear Parameters". SIAM Journal on Applied Mathematics.
 *   11(2): 431–441. doi:10.1137/0111030
 *
 *   Levenberg, K. (1944). "A Method for the Solution of Certain
 *   Non-Linear Problems in Least Squares". Quarterly of Applied
 *   Mathematics. 2(2): 164–168.
 *
 * ─── Kernel Density Estimation (KDE) ────────────────────────────
 *
 * Parametrik olmayan yoğunluk tahmini. Veri noktalarının dağılımını
 * görselleştirmek için histogram'a alternatif bir sürekli tahmin.
 *
 *   f̂(x) = (1/nh) Σᵢ K((x - xᵢ)/h)
 *
 * Bu modülde Epanechnikov çekirdeği kullanılır:
 *   K(u) = ¾(1 - u²)  , |u| ≤ 1
 *   K(u) = 0           , |u| > 1
 *
 * Epanechnikov çekirdeği, ortalama karesel hatayı minimize eden
 * optimal çekirdektir (AMISE anlamında).
 *
 * Referans:
 *   Epanechnikov, V.A. (1969). "Non-Parametric Estimation of a
 *   Multivariate Probability Density". Theory of Probability &
 *   Its Applications. 14(1): 153–158.
 *
 *   Silverman, B.W. (1986). "Density Estimation for Statistics and
 *   Data Analysis". Chapman & Hall/CRC. ISBN 978-0412246203.
 *
 * ─── Freedman-Diaconis Kuralı (Optimal Bin Genişliği) ──────────
 *
 * Histogram bin genişliğini verinin yayılımına göre otomatik belirler:
 *
 *   binWidth = 2 · IQR · n^(-1/3)
 *
 * Burada:
 *   IQR = Q₃ - Q₁ (çeyrekler arası açıklık)
 *   n   = veri sayısı
 *
 * IQR, uç değerlere (outlier) karşı standart sapmadan daha dayanıklıdır.
 *
 * Referans:
 *   Freedman, D.; Diaconis, P. (1981). "On the Histogram as a Density
 *   Estimator: L₂ Theory". Zeitschrift für Wahrscheinlichkeitstheorie
 *   und verwandte Gebiete. 57(4): 453–476. doi:10.1007/BF01025868
 */

/**
 * 3×3 doğrusal denklem sistemi çözücü (Cramer kuralı).
 * Levenberg-Marquardt'ın iç çözücüsü olarak kullanılır.
 *
 * @param {number[][]} A - 3×3 katsayı matrisi
 * @param {number[]}   b - 3×1 sağ taraf vektörü
 * @returns {number[]|null} Çözüm vektörü veya null (tekil matris)
 */
function solve3x3(A, b) {
    let det = A[0][0] * (A[1][1] * A[2][2] - A[2][1] * A[1][2])
        - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
        + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (Math.abs(det) < 1e-12) return null;

    let invDet = 1 / det;
    let x = [0, 0, 0];
    let d0 = b[0] * (A[1][1] * A[2][2] - A[2][1] * A[1][2])
        - A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2])
        + A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2]);
    let d1 = A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2])
        - b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
        + A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0]);
    let d2 = A[0][0] * (A[1][1] * b[2] - A[2][1] * b[1])
        - A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0])
        + b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    x[0] = d0 * invDet;
    x[1] = d1 * invDet;
    x[2] = d2 * invDet;
    return x;
}

/**
 * Levenberg-Marquardt algoritması ile Gaussian fit.
 *
 * Verilen (x, y) veri çiftlerine Gauss fonksiyonu uydurur.
 * f(x) = A · exp(-(x - μ)² / (2σ²))
 *
 * @param {number[]} xData        - X değerleri (bin merkezleri)
 * @param {number[]} yData        - Y değerleri (frekanslar)
 * @param {number[]} initialParams - Başlangıç parametreleri [A, μ, σ]
 * @returns {object} { A, mu, sigma } — Uydurulan parametreler
 */
function fitGaussianLM(xData, yData, initialParams) {
    let params = [...initialParams]; // [A, mu, sigma]
    let nPoints = xData.length;
    let lambda = 0.01;
    const maxIter = 50;
    const tolerance = 1e-5;

    for (let iter = 0; iter < maxIter; iter++) {
        let A = params[0], mu = params[1], sigma = params[2];
        let sigma2 = sigma * sigma;
        let sigma3 = sigma2 * sigma;

        let J = [], r = [], errSumSq = 0;

        for (let i = 0; i < nPoints; i++) {
            let x = xData[i], y = yData[i];
            let z = (x - mu) * (x - mu) / (2 * sigma2);
            let expZ = Math.exp(-z);
            let modelY = A * expZ;
            let diff = y - modelY;
            r.push(diff);
            errSumSq += diff * diff;

            // Jacobian bileşenleri
            let d_A = expZ;
            let d_mu = modelY * (x - mu) / sigma2;
            let d_sigma = modelY * ((x - mu) * (x - mu)) / sigma3;
            J.push([d_A, d_mu, d_sigma]);
        }

        // JᵀR hesapla
        let JTr = [0, 0, 0];
        for (let i = 0; i < nPoints; i++) {
            JTr[0] += J[i][0] * r[i];
            JTr[1] += J[i][1] * r[i];
            JTr[2] += J[i][2] * r[i];
        }

        // JᵀJ hesapla
        let JTJ = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < nPoints; i++) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    JTJ[row][col] += J[i][row] * J[i][col];
                }
            }
        }

        // Artırılmış matris: JᵀJ + λ·diag(JᵀJ)
        let A_aug = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                A_aug[row][col] = JTJ[row][col];
                if (row === col) A_aug[row][col] *= (1 + lambda);
            }
        }

        let delta = solve3x3(A_aug, JTr);
        if (!delta) break;

        let newParams = [params[0] + delta[0], params[1] + delta[1], params[2] + delta[2]];

        // Yeni hata hesapla
        let newErrSumSq = 0;
        for (let i = 0; i < nPoints; i++) {
            let x = xData[i], y = yData[i];
            let A_ = newParams[0], mu_ = newParams[1], sigma_ = newParams[2];
            let modelY_ = A_ * Math.exp(-((x - mu_) * (x - mu_)) / (2 * sigma_ * sigma_));
            newErrSumSq += (y - modelY_) * (y - modelY_);
        }

        // Sönümleme faktörü adaptasyonu
        if (newErrSumSq < errSumSq) {
            lambda /= 10;
            params = newParams;
            if (Math.abs(newErrSumSq - errSumSq) < tolerance) break;
        } else {
            lambda *= 10;
        }
    }
    return { A: params[0], mu: params[1], sigma: Math.abs(params[2]) };
}

/**
 * Freedman-Diaconis kuralı ile optimal bin sayısı hesaplar.
 *
 * @param {number[]} data - Veri dizisi
 * @returns {number} Önerilen bin sayısı
 */
function calculateOptimalBins(data) {
    if (data.length < 2) return 10;

    // Büyük veri setleri için örnekleme
    let sample = data;
    if (data.length > 10000) {
        sample = [];
        let step = Math.floor(data.length / 10000);
        for (let i = 0; i < data.length; i += step) sample.push(data[i]);
    }

    let sorted = [...sample].sort((a, b) => a - b);
    let n = sorted.length;
    let min = sorted[0];
    let max = sorted[n - 1];
    let range = max - min;

    // Çeyrek değerler (Quartiles)
    let q1 = sorted[Math.floor(n * 0.25)];
    let q3 = sorted[Math.floor(n * 0.75)];
    let iqr = q3 - q1; // Çeyrekler Arası Açıklık (IQR)

    if (range === 0) return 1;

    // IQR = 0 ise Sturges kuralına geri dön: bins = √n
    if (iqr === 0) return Math.ceil(Math.sqrt(n));

    // Freedman-Diaconis: binWidth = 2 · IQR · n^(-1/3)
    let binWidth = 2 * iqr * Math.pow(n, -1 / 3);
    if (binWidth === 0) binWidth = range / 50;

    let bins = Math.ceil(range / binWidth);

    // Makul sınırlara kısıtla
    return Math.max(5, Math.min(bins, 1000));
}

/**
 * Epanechnikov Kernel Density Estimation (KDE).
 *
 * @param {number[]} data     - Veri dizisi
 * @param {number}   binCount - Histogram bin sayısı (bant genişliği hesabı için)
 * @returns {object} { points: [[x, density], ...], bandwidth }
 */
function calculateKDE(data, binCount) {
    if (data.length < 2) return { points: [], bandwidth: 1 };

    let min = Math.min(...data);
    let max = Math.max(...data);
    let range = max - min;

    // Tekil veri koruması
    if (range <= 0) range = 1e-6;

    let binWidth = range / binCount;

    // Bant genişliği: bin genişliğinin 1.5 katı (empirik ölçekleme)
    let bandwidth = binWidth * 1.5;

    // Güvenlik kontrolleri
    if (bandwidth <= Number.EPSILON) bandwidth = range / 20;
    if (bandwidth <= Number.EPSILON) bandwidth = 1e-6;

    let step = range / 100;
    if (step <= 0) step = range || 0.1;

    let kdePoints = [];
    let safeSteps = 0;

    for (let x = min - range * 0.1; x <= max + range * 0.1; x += step) {
        if (safeSteps++ > 2000) break; // Sonsuz döngü koruması

        let sumK = 0;
        for (let i = 0; i < data.length; i++) {
            let u = (x - data[i]) / bandwidth;
            // Epanechnikov çekirdeği: K(u) = ¾(1 - u²) for |u| ≤ 1
            let k = (Math.abs(u) <= 1) ? 0.75 * (1 - u * u) : 0;
            sumK += k;
        }
        let density = sumK / (data.length * bandwidth);
        kdePoints.push([x, density]);
    }
    return { points: kdePoints, bandwidth };
}

// Global exposure
window.solve3x3 = solve3x3;
window.fitGaussianLM = fitGaussianLM;
window.calculateOptimalBins = calculateOptimalBins;
window.calculateKDE = calculateKDE;
