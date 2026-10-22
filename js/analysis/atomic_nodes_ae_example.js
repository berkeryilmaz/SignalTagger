/**
 * ATOMİK NODES EVRİŞİMSEL OTOENKODER (CONVOLUTIONAL AUTOENCODER - CAE) KÜMELEME ÖRNEĞİ
 * ==============================================================================
 * 
 * Bu örnek senaryo, zaman serisi sinyallerini denetimsiz (unsupervised) bir şekilde
 * işlemek için komple bir Kayan Pencere -> Autoencoder -> Latent Space KMeans -> 
 * Sinyal Maske Rekonstrüksiyonu akışını gösterir.
 * 
 * Akış Adımları:
 * 1. Sentetik bir sinyal üretilir (sinüs dalgaları + anomali faz sıçramaları).
 * 2. SlidingWindowNode ile sinyal 64'lük üst üste binen pencerelere dilimlenir: [numWindows, 64, 1].
 * 3. Evrişimsel Autoencoder (CAE) ağı kurulur:
 *    - Giriş: [64, 1]
 *    - Encoder: Conv1D (8 filtre) -> BatchNormalization -> MaxPooling1D -> Conv1D (4 filtre, latent / bottleneck alanı: [32, 4])
 *    - Decoder: Conv1DTranspose (8 filtre, strides: 2) -> Conv1D (1 filtre, rekonstrüksiyon: [64, 1])
 * 4. Model, MSE (Mean Squared Error) kaybı ile derlenir.
 * 5. ModelTrainerNode ile denetimsiz olarak eğitilir: xData = SlidingWindow, yData = SlidingWindow (Giriş = Hedef!).
 * 6. LatentExtractorNode ile modelin "bottleneck" katmanından öznitelikler [numWindows, 32, 4] çekilir.
 * 7. Çekilen öznitelikler düzleştirilerek KMeansClusteringNode ile 3 kümeye ayrılır.
 * 8. SignalMaskReconstructorNode ile pencere sınıf etiketleri orijinal sinyal boyutuna geri yansıtılır.
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

// TensorFlow.js'in yüklü olduğunu doğrula
const tf = typeof window !== 'undefined' && window.tf ? window.tf : (typeof globalThis !== 'undefined' ? globalThis.tf : null);

async function runAutoencoderClusteringWorkflow() {
  console.log("%c[Autoencoder Clustering Workflow] Başlatılıyor...", "color: #7c4dff; font-weight: bold; font-size: 14px;");

  if (!tf) {
    console.error("TensorFlow.js bulunamadı! Lütfen '@tensorflow/tfjs' paketinin kurulu olduğundan emin olun.");
    return;
  }

  // =================================================================
  // 1. SINYAL ÜRETİMİ (SENTETİK ZAMAN SERİSİ VERİSİ)
  // =================================================================
  const originalLength = 600;
  console.log(`\n1. Sinyal Oluşturuluyor... (Uzunluk: ${originalLength} örnek)`);
  
  const syntheticSignal = new Float32Array(originalLength);
  for (let i = 0; i < originalLength; i++) {
    // Bölge 1 (0 - 200): Normal yavaş sinüs dalgası
    if (i < 200) {
      syntheticSignal[i] = Math.sin(i * 0.05) * 5.0 + Math.sin(i * 0.3) * 0.5;
    }
    // Bölge 2 (200 - 400): Yüksek frekanslı/genlikli anomali dalgası (Farklı özellik)
    else if (i >= 200 && i < 400) {
      syntheticSignal[i] = Math.sin(i * 0.15) * 8.0 + Math.sin(i * 0.8) * 1.5;
    }
    // Bölge 3 (400 - 600): Düşük genlikli gürültülü faz
    else {
      syntheticSignal[i] = Math.sin(i * 0.03) * 2.0 + (Math.random() - 0.5) * 2.0;
    }
  }

  // =================================================================
  // 2. KAYAN PENCERE (SLIDING WINDOW) DÜĞÜMÜ
  // =================================================================
  const windowSize = 64;
  const stride = 16;
  console.log(`2. SlidingWindowNode Çalıştırılıyor... (Pencere: ${windowSize}, Adım: ${stride})`);
  
  const slidingWindowNode = new SlidingWindowNode('window_node', 'Kayan Pencere Dönüştürücü', {
    windowSize,
    stride
  });
  
  slidingWindowNode.connect('signal', {
    resolve: () => syntheticSignal,
    port: 'output'
  });

  const inputWindowTensor = slidingWindowNode.resolve('output');
  const numWindows = inputWindowTensor.shape[0];
  console.log(`   -> Segmentasyon Tamamlandı! Tensör Boyutu: [${inputWindowTensor.shape}] (${numWindows} adet pencere)`);

  // =================================================================
  // 3. EVRİŞİMSEL OTOENKODER (CAE) AĞ GRAPH BAĞLANTILARI (WIRING)
  // =================================================================
  console.log("\n3. Autoencoder Model Bağlantıları (Wiring) Kuruluyor...");

  // Düğüm Örneklerini Oluştur
  const inputNode = new InputLayerNode('input_layer', 'Ağ Girişi', {
    shape: [windowSize, 1]
  });

  // ENCODER KATMANLARI
  const encConv = new Conv1DNode('enc_conv', 'Encoder Evrişim', {
    filters: 8,
    kernelSize: 3,
    padding: 'same',
    activation: 'relu'
  });

  const encNorm = new BatchNormalizationNode('enc_norm', 'Encoder Batch Norm', {
    axis: -1
  });

  const encPool = new MaxPooling1DNode('enc_pool', 'Encoder Pooling (Downsample)', {
    poolSize: 2,
    strides: 2,
    padding: 'same'
  });

  // LATENT / BOTTLENECK LAYER (Buradan öznitelikleri çekeceğiz)
  const bottleneck = new Conv1DNode('bottleneck', 'Latent Bottleneck', {
    filters: 4, // 4 kanallı sıkıştırılmış özellik haritası
    kernelSize: 3,
    padding: 'same',
    activation: 'relu'
  });

  // DECODER KATMANLARI
  const decConvT = new Conv1DTransposeNode('dec_conv_t', 'Decoder Evrişim T. (Upsample)', {
    filters: 8,
    kernelSize: 3,
    strides: 2, // Zamansal boyutu 32'den tekrar 64'e çıkarır
    padding: 'same',
    activation: 'relu'
  });

  const decNorm = new BatchNormalizationNode('dec_norm', 'Decoder Batch Norm', {
    axis: -1
  });

  // REKONSTRÜKSİYON ÇIKIŞ KATMANI
  const reconstructionOutput = new Conv1DNode('reconstruction', 'Rekonstrüksiyon Çıkışı', {
    filters: 1, // Sinyal genliğini birebir yeniden oluşturmak için 1 kanal
    kernelSize: 3,
    padding: 'same',
    activation: 'linear' // Regresyon çıktısı (genlik değerleri sınırsız)
  });

  // Düğümleri Birbirine Bağla
  encConv.connect('input', inputNode, 'output');
  encNorm.connect('input', encConv, 'output');
  encPool.connect('input', encNorm, 'output');
  bottleneck.connect('input', encPool, 'output'); // Latent representation: [batch, 32, 4]

  decConvT.connect('input', bottleneck, 'output');
  decNorm.connect('input', decConvT, 'output');
  reconstructionOutput.connect('input', decNorm, 'output'); // Output shape: [batch, 64, 1]

  // =================================================================
  // 4. MODEL DERLEYİCİ (MODEL COMPILER)
  // =================================================================
  console.log("4. ModelCompilerNode ile Model Yapısı Derleniyor...");

  const compilerNode = new ModelCompilerNode('compiler', 'Autoencoder Derleyici', {
    optimizer: 'adam',
    loss: 'meanSquaredError', // Rekonstrüksiyon kaybı için MSE kullanıyoruz
    metrics: ['mae']
  });

  compilerNode.connect('input0', inputNode, 'output');
  compilerNode.connect('output0', reconstructionOutput, 'output');

  compilerNode.clearCache();
  const { model } = compilerNode.resolve();
  console.log("   -> Autoencoder Model Özeti:");
  model.summary();

  // =================================================================
  // 5. ASENKRON DENETİMSİZ EĞİTİM (AUTOENCODER MODEL TRAINER)
  // =================================================================
  console.log("\n5. ModelTrainerNode Asenkron Eğitim Süreci Başlıyor...");
  console.log("   -> Hedef (Target) veri setini Giriş (Input) veri setine eşitliyoruz (Unsupervised Learning)");

  const trainerNode = new ModelTrainerNode('trainer', 'Autoencoder Eğitici', {
    epochs: 15, // Hızlı gösterim için 15 epoch
    batchSize: 8,
    validationSplit: 0.1
  });

  trainerNode.connect('model', compilerNode, 'model');
  // Autoencoder'ın kalbi: xData ve yData aynı pencere tensörüdür!
  trainerNode.connect('xData', { resolve: () => inputWindowTensor, port: 'output' });
  trainerNode.connect('yData', { resolve: () => inputWindowTensor, port: 'output' });

  trainerNode.clearCache();
  const trainResult = await trainerNode.resolveAsync();
  console.log("   -> Model Eğitimi Başarıyla Tamamlandı!");
  console.log("   -> Son Epoch Kaybı (MSE):", trainResult.history.history.loss[trainResult.history.history.loss.length - 1].toFixed(5));

  // =================================================================
  // 6. LATENT ALAN ÖZNİTELİK ÇIKARIMI (LATENT EXTRACTOR)
  // =================================================================
  console.log("\n6. LatentExtractorNode ile 'bottleneck' Katmanının Öznitelikleri Çekiliyor...");

  const latentExtractorNode = new LatentExtractorNode('extractor', 'Bottleneck Öznitelik Çıkarıcı', {
    layerName: 'bottleneck'
  });

  latentExtractorNode.connect('model', compilerNode, 'model');
  latentExtractorNode.connect('inputData', { resolve: () => inputWindowTensor, port: 'output' });

  latentExtractorNode.clearCache();
  const latentEmbeddings = latentExtractorNode.resolve('output');
  console.log(`   -> Latent Vektörler Başarıyla Çekildi! Boyut: [${latentEmbeddings.shape}]`);

  // =================================================================
  // 7. K-MEANS KÜMELEME DÜĞÜMÜ
  // =================================================================
  console.log("\n7. KMeansClusteringNode ile Latent Vektörler Kümeleniyor...");
  
  // 3B latent tensörü [numWindows, 32, 4], KMeans için 2B boyuta [numWindows, 128] düzleştirilir
  const flattenedEmbeddings = tf.tidy(() => {
    return latentEmbeddings.reshape([numWindows, -1]);
  });

  const kmeansNode = new KMeansClusteringNode('kmeans', 'Latent Alan Kümeleyicisi', {
    k: 3, // Sinyalde oluşturduğumuz 3 belirgin faz bölgesini temsil etsin
    maxIterations: 50
  });

  kmeansNode.connect('embeddings', { resolve: () => flattenedEmbeddings, port: 'output' });
  
  kmeansNode.clearCache();
  const { output: clusterAssignments } = kmeansNode.resolve();
  console.log("   -> K-Means Kümeleme Tamamlandı!");

  // =================================================================
  // 8. SİNYAL MASKE OLUŞTURUCU (SIGNAL MASK RECONSTRUCTOR)
  // =================================================================
  console.log(`\n8. SignalMaskReconstructorNode ile Sinyal Bölgeleri Etiketleniyor (Uzunluk: ${originalLength})...`);

  const reconstructorNode = new SignalMaskReconstructorNode('reconstructor', 'Bölgesel Etiket Yansıtıcı', {
    originalLength,
    windowSize,
    stride
  });

  reconstructorNode.connect('clusterIds', { resolve: () => clusterAssignments, port: 'output' });

  reconstructorNode.clearCache();
  const finalContinuousMask = reconstructorNode.resolve('output');

  console.log("%c   -> Bölgesel Etiketleme Tamamlandı!", "color: #10b981; font-weight: bold;");
  
  // Kümeleme sonuçlarını ve sinyal faz bölgelerini analiz edelim
  const phase1 = Array.from(finalContinuousMask.slice(20, 180));
  const phase2 = Array.from(finalContinuousMask.slice(220, 380));
  const phase3 = Array.from(finalContinuousMask.slice(420, 580));

  const getMostFrequent = (arr) => {
    const counts = {};
    arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
    return Object.entries(counts).sort((a,b) => b[1] - a[1])[0][0];
  };

  console.log(`   -> Bölge 1 (Normal Sinyal) baskın atanan Küme Etiketi: Cluster ${getMostFrequent(phase1)}`);
  console.log(`   -> Bölge 2 (Yüksek Genlik/Frekans) baskın atanan Küme Etiketi: Cluster ${getMostFrequent(phase2)}`);
  console.log(`   -> Bölge 3 (Düşük Genlik Gürültü) baskın atanan Küme Etiketi: Cluster ${getMostFrequent(phase3)}`);

  // =================================================================
  // TEMİZLİK (CLEANUP)
  // =================================================================
  tf.dispose([
    inputWindowTensor, 
    latentEmbeddings, 
    flattenedEmbeddings, 
    model
  ]);
  console.log("\n9. TensorFlow.js Belleği Temizlendi.");
  console.log("%c[Autoencoder Clustering Workflow] Süreç Başarıyla Tamamlandı!", "color: #10b981; font-weight: bold; font-size: 14px;");
}

// Node.js veya browser ortam tetikleyicisi
if (typeof window === 'undefined') {
  runAutoencoderClusteringWorkflow();
}

export { runAutoencoderClusteringWorkflow };
