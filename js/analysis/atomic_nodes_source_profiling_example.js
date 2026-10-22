/**
 * ATOMİK NODES İLE MAVCUT DÜĞÜMLERİ KULLANARAK UÇTAN UCA SİNYAL PROFİLLEME VE ANOMALİ AKIŞI
 * =======================================================================================
 * 
 * Bu akış, projede ZATEN TANIMLI OLAN `globalThis.AtomicNodes` sınıflarını 
 * (SlidingWindowNode, InputLayerNode, Conv1DNode, Conv1DTransposeNode, 
 * ModelCompilerNode, ModelTrainerNode, LatentExtractorNode, KMeansClusteringNode, 
 * SignalMaskReconstructorNode, BatchNormalizationNode) kullanarak 17 adımlı mantığı birebir uygular.
 * 
 * Akış Adımları:
 * 1-2. Veri Girişi ve Ön İşleme: Kaynaksız ve Kaynaklı sinyaller oluşturulur/filtrelenir.
 * 3-5. Pencereleme & Türev: Kayan pencere (SlidingWindowNode) ile sinyal dilimlenir.
 * 6-7. CNN Autoencoder Eğitimi: 
 *      - Encoder: Input -> Conv1D ('n4') -> BatchNormalization -> MaxPooling1D -> Conv1D ('bottleneck')
 *      - Decoder: Conv1DTranspose -> Conv1D (Rekonstrüksiyon)
 *      - ModelCompilerNode & ModelTrainerNode ile kaynaksız veri üzerinde eğitilir.
 * 8-10. Latent Vektör & Profil Kümeleme:
 *      - LatentExtractorNode ile 'bottleneck' katmanından sıkıştırılmış öznitelikler çekilir.
 *      - KMeansClusteringNode ile kaynaksız sinyalin doğal pik profilleri kümelenir.
 * 11-13. Kaynaklı Sinyal İnferansı & Profil Eşleştirme:
 *      - Kaynaklı sinyal SlidingWindowNode ve LatentExtractorNode'dan geçirilir.
 * 14-16. Rekonstrüksiyon Hatası & Anomali Skoru:
 *      - Autoencoder tahminindeki Ortalama Kare Hata (MSE) ile fark belirlenir.
 * 17. Sinyal Rekonstrüksiyonu:
 *      - SignalMaskReconstructorNode ile anomali maskesi orijinal sinyal boyutuna yansıtılır.
 */

import './atomic_nodes.js';

const {
  InputLayerNode,
  Conv1DNode,
  MaxPooling1DNode,
  Conv1DTransposeNode,
  ModelCompilerNode,
  ModelTrainerNode,
  LatentExtractorNode,
  SlidingWindowNode,
  KMeansClusteringNode,
  SignalMaskReconstructorNode,
  BatchNormalizationNode
} = globalThis.AtomicNodes;

// TensorFlow.js doğrulama
const tf = typeof window !== 'undefined' && window.tf ? window.tf : (typeof globalThis !== 'undefined' ? globalThis.tf : null);

export async function runExistingNodesProfilingPipeline() {
  console.log("%c=====================================================================", "color: #7c4dff; font-weight: bold;");
  console.log("%c[SignalTagger] MEVCUT ATOMİK DÜĞÜMLER İLE 17 ADIMLI ANOMALİ AKIŞI", "color: #7c4dff; font-weight: bold; font-size: 14px;");
  console.log("%c=====================================================================", "color: #7c4dff; font-weight: bold;");

  if (!tf) {
    console.error("TensorFlow.js bulunamadı!");
    return;
  }

  // =================================================================
  // 1. VERİ GİRİŞİ VE ÖN İŞLEME (INPUT & PREPROCESSING)
  // =================================================================
  const signalLength = 800;
  console.log(`\n1-2. Sinyaller Hazırlanıyor... (Uzunluk: ${signalLength} örnek)`);

  const sfSignal = new Float32Array(signalLength);
  const srcSignal = new Float32Array(signalLength);

  for (let i = 0; i < signalLength; i++) {
    // Kaynaksız Temiz Sinyal (Normal Pikler)
    const base = Math.sin(i * 0.04) * 2.0;
    const peak = (i % 150 === 40) ? 4.0 * Math.exp(-Math.pow((i % 150 - 40) / 8, 2)) : 0;
    sfSignal[i] = base + peak;

    // Kaynaklı Sinyal (Ekstra anomali/kaynak darbeleri içerir)
    const anomaly = (i >= 300 && i <= 340) ? 6.0 * Math.sin((i - 300) * 0.2) : 0;
    srcSignal[i] = base + peak + anomaly;
  }

  // =================================================================
  // 3-5. KAYAN PENCERE DÜĞÜMÜ (SLIDING WINDOW NODE)
  // =================================================================
  const windowSize = 64;
  const stride = 16;
  console.log(`\n3-5. SlidingWindowNode (Pencereleme) Çalıştırılıyor...`);

  const sfWindowNode = new SlidingWindowNode('sf_window', 'Kaynaksız Pencereleme', { windowSize, stride });
  sfWindowNode.connect('signal', { resolve: () => sfSignal, port: 'output' });
  const sfWindowTensor = sfWindowNode.resolve('output');

  const srcWindowNode = new SlidingWindowNode('src_window', 'Kaynaklı Pencereleme', { windowSize, stride });
  srcWindowNode.connect('signal', { resolve: () => srcSignal, port: 'output' });
  const srcWindowTensor = srcWindowNode.resolve('output');

  console.log(`   -> Kaynaksız Pencere Tensörü: [${sfWindowTensor.shape}]`);
  console.log(`   -> Kaynaklı Pencere Tensörü:  [${srcWindowTensor.shape}]`);

  // =================================================================
  // 6-7. CNN AUTOENCODER MODEL GRAFİĞİ VE EĞİTİMİ (MEVCUT ATOMİK DÜĞÜMLER)
  // =================================================================
  console.log("\n6-7. CNN Autoencoder Bağlantıları Kuruluyor...");

  const inputNode = new InputLayerNode('input_layer', 'Ağ Girişi', { shape: [windowSize, 1] });

  // Encoder Katmanları
  const encConv1 = new Conv1DNode('enc_conv1', 'Encoder Conv 1', { filters: 16, kernelSize: 5, padding: 'same', activation: 'relu' });
  const encNorm1 = new BatchNormalizationNode('enc_norm1', 'Encoder Norm 1', { axis: -1 });
  const encPool1 = new MaxPooling1DNode('enc_pool1', 'Encoder Pool 1', { poolSize: 2, strides: 2, padding: 'same' });

  // Bottleneck (Gizil Katman)
  const bottleneck = new Conv1DNode('bottleneck', 'Bottleneck Katmanı', { filters: 8, kernelSize: 3, padding: 'same', activation: 'relu' });

  // Decoder Katmanları
  const decTrans1 = new Conv1DTransposeNode('dec_trans1', 'Decoder Transpose 1', { filters: 16, kernelSize: 3, strides: 2, padding: 'same', activation: 'relu' });
  const decConvOut = new Conv1DNode('dec_out', 'Decoder Rekonstrüksiyon', { filters: 1, kernelSize: 5, padding: 'same', activation: 'linear' });

  // Graph Wiring (Bağlantılar)
  encConv1.connect('input', inputNode, 'output');
  encNorm1.connect('input', encConv1, 'output');
  encPool1.connect('input', encNorm1, 'output');

  bottleneck.connect('input', encPool1, 'output');

  decTrans1.connect('input', bottleneck, 'output');
  decConvOut.connect('input', decTrans1, 'output');

  // ModelCompiler & ModelTrainer Nodes
  const compilerNode = new ModelCompilerNode('compiler', 'Model Derleyici', {
    optimizer: 'adam',
    loss: 'meanSquaredError'
  });
  compilerNode.connect('input0', inputNode, 'output');
  compilerNode.connect('output0', decConvOut, 'output');
  const compiledModel = compilerNode.resolve('model');

  const trainerNode = new ModelTrainerNode('trainer', 'Model Eğitici', {
    epochs: 10,
    batchSize: 16,
    validationSplit: 0.1,
    trainModel: true
  });

  trainerNode.connect('model', compilerNode, 'model');
  trainerNode.connect('xData', sfWindowNode, 'output');
  trainerNode.connect('yData', sfWindowNode, 'output');

  console.log("   -> Model Trainer Çalıştırılıyor (Kaynaksız Veri ile Autoencoder Eğitimi)...");
  const { model } = await trainerNode.executeAsync({
    model: compiledModel,
    xData: sfWindowTensor,
    yData: sfWindowTensor
  });

  // =================================================================
  // 8-10. LATENT EXTRACTION & K-MEANS CLUSTERING (MEVCUT DÜĞÜMLER)
  // =================================================================
  console.log("\n8-10. LatentExtractorNode & KMeansClusteringNode Çalıştırılıyor...");

  const sfLatentNode = new LatentExtractorNode('sf_latent', 'Kaynaksız Latent Çıkarıcı', { layerName: 'bottleneck' });
  sfLatentNode.connect('model', trainerNode, 'model');
  sfLatentNode.connect('inputData', sfWindowNode, 'output');
  const sfLatentTensor = sfLatentNode.resolve('output');

  // Latent vektörleri düzleştirip KMeansClusteringNode'a veriyoruz
  const flatSfLatent = tf.tidy(() => tf.mean(sfLatentTensor, 1));
  const kmeansNode = new KMeansClusteringNode('kmeans', 'Profil Kümeleme', { k: 3, maxIterations: 50 });
  const kmeansOut = kmeansNode.execute({ embeddings: flatSfLatent });
  console.log(`   -> KMeans Kümeleme Tamamlandı! Merkez Sayısı: ${kmeansOut.centroids.length}`);

  // =================================================================
  // 11-13. KAYNAKLI SİNYAL İNFERANSI & LATENT ÇIKARIMI
  // =================================================================
  console.log("\n11-13. Kaynaklı Sinyal Latent Vektörleri Çıkarılıyor...");

  const srcLatentNode = new LatentExtractorNode('src_latent', 'Kaynaklı Latent Çıkarıcı', { layerName: 'bottleneck' });
  const srcLatentTensor = srcLatentNode.execute({ model, inputData: srcWindowTensor }).output;
  const flatSrcLatent = tf.tidy(() => tf.mean(srcLatentTensor, 1));

  // =================================================================
  // 14-16. REKONSTRÜKSİYON HATASI & ANOMALİ EŞİKLEME (RECONSTRUCTION MSE)
  // =================================================================
  console.log("\n14-16. Autoencoder Rekonstrüksiyon Hatası (MSE) Hesaplanıyor...");

  const windowPredictions = model.predict(srcWindowTensor);
  const reconErrorsTensor = tf.tidy(() => {
    const diff = tf.sub(srcWindowTensor, windowPredictions);
    return tf.mean(tf.square(diff), [1, 2]); // Pencere bazlı MSE
  });
  const reconErrors = reconErrorsTensor.dataSync();

  // Anomali thresholding (Eşikleme): MSE > Threshold ise Kaynak Etkili (Sınıf 2), değilse Normal (Sınıf 1)
  const threshold = 0.5;
  const numWindows = srcWindowTensor.shape[0];
  const windowLabels = new Int32Array(numWindows);
  let anomalyCount = 0;

  for (let w = 0; w < numWindows; w++) {
    if (reconErrors[w] > threshold) {
      windowLabels[w] = 2; // Kaynak Etkili / Anomali Sınıfı
      anomalyCount++;
    } else {
      windowLabels[w] = 1; // Normal Pik Sınıfı
    }
  }
  console.log(`   -> Toplam ${numWindows} pencereden ${anomalyCount} adedi Kaynak Etkili (Anomali) olarak etiketlendi.`);

  // =================================================================
  // 17. SİNYAL MASKESİ REKONSTRÜKSİYON DÜĞÜMÜ (SIGNAL MASK RECONSTRUCTOR)
  // =================================================================
  console.log("\n17. SignalMaskReconstructorNode ile Orijinal Sinyale Yansıtılıyor...");

  const maskReconstructor = new SignalMaskReconstructorNode('mask_recon', 'Maske Yeniden Oluşturucu', {
    originalLength: signalLength,
    windowSize: windowSize,
    stride: stride
  });

  const finalMask = maskReconstructor.execute({ clusterIds: windowLabels }).output;

  console.log("%c=====================================================================", "color: #00e676; font-weight: bold;");
  console.log("%c[Akış Başarıyla Tamamlandı!] Orijinal Sinyal Maskesi Üretildi.", "color: #00e676; font-weight: bold; font-size: 14px;");
  console.log("%c=====================================================================", "color: #00e676; font-weight: bold;");

  // Bellek temizleme
  sfWindowTensor.dispose();
  srcWindowTensor.dispose();
  sfLatentTensor.dispose();
  srcLatentTensor.dispose();
  flatSfLatent.dispose();
  flatSrcLatent.dispose();
  windowPredictions.dispose();
  reconErrorsTensor.dispose();

  return {
    sfSignal,
    srcSignal,
    finalMask,
    reconErrors
  };
}

// Global olarak erişilebilir kıl
if (typeof window !== 'undefined') {
  window.runExistingNodesProfilingPipeline = runExistingNodesProfilingPipeline;
}
