/**
 * ATOMİK NODES 1D U-NET & DSP WIRING VE UÇTAN UCA ENTEGRASYON ÖRNEĞİ
 * ================================================================
 * 
 * Bu dosya, Atomik Node kütüphanesinin tüm düğümlerini bir araya getirerek:
 * 1. 1D U-Net (Giriş -> Conv1D -> Downsample -> Bottleneck -> Conv1DTranspose -> Skip Concatenate -> Çıkış) kurar.
 * 2. Zaman serisi sinyalini SlidingWindowNode ile dilimler.
 * 3. Modeli derler, asenkron olarak eğitir.
 * 4. LatentExtractorNode ile bottleneck özniteliklerini çeker.
 * 5. KMeansClusteringNode ile öznitelikleri gruplar.
 * 6. SignalMaskReconstructorNode çoğunluk oylaması ile kesintisiz orijinal sinyal maskesini çıkarır.
 */

import './atomic_nodes.js';

const {
  InputLayerNode,
  Conv1DNode,
  MaxPooling1DNode,
  Conv1DTransposeNode,
  ConcatenateNode,
  ModelCompilerNode,
  ModelTrainerNode,
  LatentExtractorNode,
  SlidingWindowNode,
  KMeansClusteringNode,
  SignalMaskReconstructorNode
} = globalThis.AtomicNodes;

// TensorFlow.js'in yüklü olduğunu doğrula
const tf = typeof window !== 'undefined' && window.tf ? window.tf : (typeof globalThis !== 'undefined' ? globalThis.tf : null);

/**
 * Komple Uçtan Uca Entegrasyon Senaryosunu Çalıştırır
 */
async function runUnetSegmentationWorkflow() {
  console.log("%c[Atomic Nodes Workflow] Başlatılıyor...", "color: #3b82f6; font-weight: bold; font-size: 14px;");

  if (!tf) {
    console.error("TensorFlow.js algılanamadı! Lütfen node ortamındaysanız '@tensorflow/tfjs' paketini import edin.");
    return;
  }

  // =================================================================
  // 1. SINYAL ÜRETİMİ (SENTETİK ZAMAN SERİSİ VERİSİ)
  // =================================================================
  const originalLength = 500;
  console.log(`\n1. Sinyal Oluşturuluyor... (Uzunluk: ${originalLength} örnek)`);
  
  // Sentetik sinyal (sinüs dalgası + yüksek frekanslı gürültü + ani sıçramalar)
  const syntheticSignal = new Float32Array(originalLength);
  for (let i = 0; i < originalLength; i++) {
    // Klasik sinüs dalgası
    let base = Math.sin(i * 0.05) * 10;
    // Gürültü ekle
    let noise = Math.sin(i * 0.5) * 1.5;
    // Belli bölgelerde ani segment sıçraması (anomali / farklı faz)
    let phaseShift = (i > 150 && i < 300) ? 8.0 : 0.0;
    
    syntheticSignal[i] = base + noise + phaseShift;
  }

  // =================================================================
  // 2. DSP DÜĞÜMÜ: SLIDING WINDOW (KAYAN PENCERE) SEGMENTASYONU
  // =================================================================
  const windowSize = 64;
  const stride = 16;
  console.log(`2. SlidingWindowNode Çalıştırılıyor... (Window: ${windowSize}, Stride: ${stride})`);
  
  const slidingWindowNode = new SlidingWindowNode('window_node', 'Kayan Pencere Sinyal Dönüştürücü', {
    windowSize,
    stride
  });
  
  // Sinyal verisini doğrudan resolve et
  slidingWindowNode.connect('signal', {
    resolve: () => syntheticSignal,
    port: 'output'
  });

  // Windows tensörünü üret: [numWindows, windowSize, 1]
  const inputWindowTensor = slidingWindowNode.resolve('output');
  const numWindows = inputWindowTensor.shape[0];
  console.log(`   -> Segmentasyon Tamamlandı! Tensor Boyutu: [${inputWindowTensor.shape}] (${numWindows} Pencere)`);

  // =================================================================
  // 3. 1D U-NET MODEL AĞININ ATOMİK DÜĞÜMLERLE BAĞLANMASI (WIRING)
  // =================================================================
  console.log("\n3. 1D U-Net Model Graph Bağlantıları (Wiring) Kuruluyor...");

  // Düğüm Örneklerini Oluştur
  const inputNode = new InputLayerNode('input_layer', 'Ağ Giriş Katmanı', {
    shape: [windowSize, 1]
  });

  const encoderConv = new Conv1DNode('encoder_conv', 'Encoder Evrişim Katmanı', {
    filters: 8,
    kernelSize: 3,
    padding: 'same',
    activation: 'relu'
  });

  const maxPool = new MaxPooling1DNode('max_pool', 'Downsampling (MaxPooling)', {
    poolSize: 2,
    strides: 2,
    padding: 'same'
  });

  const bottleneck = new Conv1DNode('bottleneck', 'Bottleneck Temsili (Dar Boğaz)', {
    filters: 16,
    kernelSize: 3,
    padding: 'same',
    activation: 'relu'
  });

  const decoderConvTranspose = new Conv1DTransposeNode('decoder_conv_t', 'Decoder Evrişim Katmanı (Learnable Upsampling)', {
    filters: 8,
    kernelSize: 3,
    strides: 2, // Zamansal boyutu 2 kat büyüterek downsample öncesi duruma getirir (32 * 2 = 64)
    padding: 'same',
    activation: 'relu'
  });

  const skipConcatenate = new ConcatenateNode('skip_concat', 'Atlamalı Bağlantı Birleştirici (Skip Connection)', {
    axis: -1 // Kanal (özellik) ekseninde birleştirme yapar
  });

  const outputClassifier = new Conv1DNode('output_layer', 'Sınıflandırıcı Çıkış Katmanı', {
    filters: 1, // İkili segmentasyon veya regresyon maskesi
    kernelSize: 1,
    padding: 'same',
    activation: 'sigmoid'
  });

  // Düğümleri Birbirine Bağla (Visual Wiring logic)
  encoderConv.connect('input', inputNode, 'output');
  maxPool.connect('input', encoderConv, 'output');
  bottleneck.connect('input', maxPool, 'output');
  
  // Bottleneck çıkışını yukarı örnekle
  decoderConvTranspose.connect('input', bottleneck, 'output');
  
  // U-Net'in kalbi: Encoder çıktısını (Skip Connection) ve Decoder yukarı örneklenmiş çıktısını Concatenate et!
  skipConcatenate.connect('input0', encoderConv, 'output');     // Encoder Skip bağlantısı (shape: [batch, 64, 8])
  skipConcatenate.connect('input1', decoderConvTranspose, 'output'); // Decoder upsampled çıktısı (shape: [batch, 64, 8])
  
  // Çıkış sınıflandırıcısını birleştirilmiş tensöre bağla (shape: [batch, 64, 16] -> [batch, 64, 1])
  outputClassifier.connect('input', skipConcatenate, 'output');

  // =================================================================
  // 4. MODEL COMPILER VE TRAINER DÜĞÜMLERİ
  // =================================================================
  console.log("4. ModelCompilerNode ile Model Yapısı Derleniyor...");

  const compilerNode = new ModelCompilerNode('compiler', '1D U-Net Model Derleyici', {
    optimizer: 'adam',
    loss: 'binaryCrossentropy',
    metrics: ['mae']
  });

  // Giriş ve Çıkış portlarını tanımla
  compilerNode.connect('input0', inputNode, 'output');
  compilerNode.connect('output0', outputClassifier, 'output');

  // Grafı temizle ve derleme yap
  compilerNode.clearCache();
  const { model } = compilerNode.resolve();
  console.log("   -> Model başarıyla derlendi! Katmanlar listesi:");
  model.summary();

  // =================================================================
  // 5. ASENKRON EĞİTİM (EĞİTİCİ DÜĞÜM)
  // =================================================================
  console.log("\n5. ModelTrainerNode Asenkron Eğitim Süreci Başlıyor...");
  
  // Sentetik hedef etiketleri (Y) üret: [numWindows, windowSize, 1]
  // Sinyal değerlerinin 0'dan büyük olduğu bölgeleri maske olarak veriyoruz
  const yData = tf.tidy(() => {
    const thresholded = tf.greater(inputWindowTensor, 0).toFloat();
    return thresholded;
  });

  const trainerNode = new ModelTrainerNode('trainer', 'Eğitici Düğüm', {
    epochs: 5,
    batchSize: 8,
    validationSplit: 0.1
  });

  trainerNode.connect('model', compilerNode, 'model');
  trainerNode.connect('xData', { resolve: () => inputWindowTensor, port: 'output' });
  trainerNode.connect('yData', { resolve: () => yData, port: 'output' });

  trainerNode.clearCache();
  // Asenkron eğitimi tetikle
  const trainResult = await trainerNode.resolveAsync();
  console.log("   -> Model Eğitimi Başarıyla Tamamlandı!");
  console.log("   -> Son Epoch Kaybı (Loss):", trainResult.history.history.loss[trainResult.history.history.loss.length - 1].toFixed(5));

  // =================================================================
  // 6. ÖZNİTELİK ÇIKARIMI (LATENT EXTRACTOR NODE)
  // =================================================================
  console.log("\n6. LatentExtractorNode ile 'bottleneck' Katmanının Temsil Vektörleri Çekiliyor...");

  const latentExtractorNode = new LatentExtractorNode('extractor', 'Bottleneck Öznitelik Çıkarıcı', {
    layerName: 'bottleneck' // Çekmek istediğimiz katmanın düğüm/katman ID'si
  });

  latentExtractorNode.connect('model', compilerNode, 'model');
  latentExtractorNode.connect('inputData', { resolve: () => inputWindowTensor, port: 'output' });

  latentExtractorNode.clearCache();
  const latentEmbeddingsTensor = latentExtractorNode.resolve('output');
  console.log(`   -> Öznitelikler Başarıyla Çekildi! Tensör Boyutu: [${latentEmbeddingsTensor.shape}]`);

  // =================================================================
  // 7. K-MEANS KÜMELEME DÜĞÜMÜ (KMEANS CLUSTERING NODE)
  // =================================================================
  console.log("\n7. KMeansClusteringNode ile Latent Vektörler Kümeleniyor...");
  
  // K-Means için 3B bottleneck tensorünü 2B düz yapıya sokmamız gerekiyor
  // Shape: [numWindows, 32, 16] -> [numWindows, 32 * 16] (Her pencerenin bottleneck öznitelik matrisini tek vektör yaparız)
  const flattenedEmbeddings = tf.tidy(() => {
    return latentEmbeddingsTensor.reshape([numWindows, -1]);
  });

  const kmeansNode = new KMeansClusteringNode('kmeans', 'Latent Alan Kümeleyicisi (K-Means)', {
    k: 3,
    maxIterations: 50
  });

  kmeansNode.connect('embeddings', { resolve: () => flattenedEmbeddings, port: 'output' });
  
  kmeansNode.clearCache();
  const { output: clusterAssignments, centroids } = kmeansNode.resolve();
  console.log("   -> K-Means Kümeleme Tamamlandı!");
  console.log("   -> İlk 10 pencerenin atanan küme ID'leri:", clusterAssignments.slice(0, 10));

  // =================================================================
  // 8. SEGMENT MASK RECONSTRUCTOR NODE (ÇOĞUNLUK OYLAMASI İLE MASK RECONSTRUCTION)
  // =================================================================
  console.log(`\n8. SignalMaskReconstructorNode ile Pencere Etiketleri Orijinal Sinyal Boyutuna (${originalLength}) Map Ediliyor...`);

  const reconstructorNode = new SignalMaskReconstructorNode('reconstructor', 'Segment Maske Oluşturucu (Çoğunluk Oylaması)', {
    originalLength,
    windowSize,
    stride
  });

  reconstructorNode.connect('clusterIds', { resolve: () => clusterAssignments, port: 'output' });

  reconstructorNode.clearCache();
  const finalContinuousMask = reconstructorNode.resolve('output');

  console.log("%c   -> Maske Rekonstrüksiyonu Tamamlandı!", "color: #10b981; font-weight: bold;");
  console.log(`   -> Orijinal Sinyal Örnek Sayısı: ${originalLength}`);
  console.log(`   -> Rekonstrükte Edilen Sürekli Maske Boyutu: ${finalContinuousMask.length}`);
  
  // İlk 20 örneğin ve son 20 örneğin nihai segment etiketlerini ekrana yaz
  console.log("   -> Sinyalin İlk 30 Örneğindeki Segment ID'leri:", Array.from(finalContinuousMask.slice(0, 30)).join(', '));
  console.log("   -> Sinyalin Son 30 Örneğindeki Segment ID'leri:", Array.from(finalContinuousMask.slice(originalLength - 30)).join(', '));

  // =================================================================
  // TENSOR BELLEK TEMİZLİĞİ (CLEANUP)
  // =================================================================
  console.log("\n9. TensorFlow.js Bellek Temizliği Yapılıyor...");
  tf.dispose([
    inputWindowTensor, 
    yData, 
    latentEmbeddingsTensor, 
    flattenedEmbeddings, 
    model
  ]);
  console.log(`   -> Kalan Aktif Tensör Sayısı: ${tf.memory().numTensors}`);
  console.log("%c[Atomic Nodes Workflow] Uçtan Uca Süreç Başarıyla Sonlandı!", "color: #10b981; font-weight: bold; font-size: 14px;");
}

// Global scope veya modüler ortam çalıştırma tetikleyicisi
if (typeof window === 'undefined') {
  runUnetSegmentationWorkflow();
}

export { runUnetSegmentationWorkflow };
