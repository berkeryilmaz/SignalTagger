/**
 * ATOMİK NODES DENETİMSİZ U-NET AUTOENCODER SEGMENTASYON ÖRNEĞİ
 * ==============================================================
 * 
 * Bu senaryoda, U-Net yapısı denetimsiz (unsupervised) bir otoenkoder 
 * (U-Net Autoencoder) olarak kurulur ve sinyaldeki karakteristik bölgeleri 
 * insan müdahalesi olmadan çıkartmak için kullanılır.
 * 
 * Mimari Yapısı (U-Shape):
 * - Sol Bacak (Encoder): Input -> Conv1D -> BatchNormalization -> MaxPooling1D -> Conv1D -> BatchNormalization -> MaxPooling1D
 * - Taban (Bottleneck): Conv1D (Filtre: 32, Katman ismi: 'n10') -> Sıkıştırılmış öznitelikler burada toplanır.
 * - Sağ Bacak (Decoder): Conv1DTranspose -> Concatenate (Skip L2) -> Conv1DTranspose -> Concatenate (Skip L1) -> Conv1D (Rekonstrüksiyon)
 * 
 * Akış Adımları:
 * 1. Sentetik bir sinyal üretilir (farklı davranışlara sahip 3 ayrı bölge).
 * 2. SlidingWindowNode ile sinyal 64'lük pencerelere dilimlenir.
 * 3. 2 katmanlı derin U-Net Autoencoder kurulur.
 * 4. Model, MSE kaybı ile derlenir.
 * 5. ModelTrainerNode ile denetimsiz eğitilir (xData = SlidingWindow, yData = SlidingWindow).
 * 6. LatentExtractorNode, 'n10' bottleneck katmanından sıkıştırılmış temsilleri [numWindows, 16, 32] çeker.
 * 7. Çekilen latent vektörler K-Means ile 3 sınıfa kümelenir.
 * 8. SignalMaskReconstructorNode ile sınıflar sürekli sinyale yansıtılır.
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
  SignalMaskReconstructorNode,
  BatchNormalizationNode
} = globalThis.AtomicNodes;

// TensorFlow.js'in yüklü olduğunu doğrula
const tf = typeof window !== 'undefined' && window.tf ? window.tf : (typeof globalThis !== 'undefined' ? globalThis.tf : null);

async function runUnsupervisedUnetSegmentation() {
  console.log("%c[Unsupervised U-Net Segmentation] Başlatılıyor...", "color: #7c4dff; font-weight: bold; font-size: 14px;");

  if (!tf) {
    console.error("TensorFlow.js bulunamadı!");
    return;
  }

  // =================================================================
  // 1. SINYAL ÜRETİMİ (SENTETİK ZAMAN SERİSİ VERİSİ)
  // =================================================================
  const originalLength = 600;
  console.log(`\n1. Sinyal Oluşturuluyor... (Uzunluk: ${originalLength} örnek)`);
  
  const syntheticSignal = new Float32Array(originalLength);
  for (let i = 0; i < originalLength; i++) {
    if (i < 200) {
      syntheticSignal[i] = Math.sin(i * 0.05) * 5.0 + Math.sin(i * 0.3) * 0.5; // Faz 1
    } else if (i >= 200 && i < 400) {
      syntheticSignal[i] = Math.sin(i * 0.15) * 8.0 + Math.sin(i * 0.8) * 1.5; // Faz 2 (Yüksek Genlik)
    } else {
      syntheticSignal[i] = Math.sin(i * 0.03) * 2.0 + (Math.random() - 0.5) * 2.0; // Faz 3 (Gürültülü)
    }
  }

  // =================================================================
  // 2. KAYAN PENCERE DÜĞÜMÜ
  // =================================================================
  const windowSize = 64;
  const stride = 16;
  console.log(`2. SlidingWindowNode Çalıştırılıyor...`);
  
  const slidingWindowNode = new SlidingWindowNode('window_node', 'Kayan Pencere', { windowSize, stride });
  slidingWindowNode.connect('signal', { resolve: () => syntheticSignal, port: 'output' });
  const inputWindowTensor = slidingWindowNode.resolve('output');
  const numWindows = inputWindowTensor.shape[0];
  console.log(`   -> Segmentasyon Tamamlandı! Tensor: [${inputWindowTensor.shape}]`);

  // =================================================================
  // 3. DERİN U-NET AUTOENCODER GRAPH BAĞLANTILARI (WIRING)
  // =================================================================
  console.log("\n3. Symmetrik Derin U-Net Model Bağlantıları Kuruluyor...");

  const inputNode = new InputLayerNode('input_layer', 'Ağ Girişi', { shape: [windowSize, 1] });

  // --- ENCODER (SOL BACAK) ---
  const encConv1 = new Conv1DNode('n4', 'Encoder L1 Conv', { filters: 8, kernelSize: 3, padding: 'same', activation: 'relu' });
  const encNorm1 = new BatchNormalizationNode('n5', 'Encoder L1 Batch Norm', { axis: -1 });
  const encPool1 = new MaxPooling1DNode('n6', 'Encoder L1 Pool', { poolSize: 2, strides: 2, padding: 'same' });

  const encConv2 = new Conv1DNode('n7', 'Encoder L2 Conv', { filters: 16, kernelSize: 3, padding: 'same', activation: 'relu' });
  const encNorm2 = new BatchNormalizationNode('n8', 'Encoder L2 Batch Norm', { axis: -1 });
  const encPool2 = new MaxPooling1DNode('n9', 'Encoder L2 Pool', { poolSize: 2, strides: 2, padding: 'same' });

  // --- BOTTLENECK (TABAN) ---
  const bottleneck = new Conv1DNode('n10', 'Bottleneck L3 Conv', { filters: 32, kernelSize: 3, padding: 'same', activation: 'relu' });

  // --- DECODER (SAĞ BACAK) ---
  const decConvT1 = new Conv1DTransposeNode('n11', 'Decoder L2 Transpose', { filters: 16, kernelSize: 3, strides: 2, padding: 'same', activation: 'relu' });
  const skipConcat1 = new ConcatenateNode('n12', 'L2 Skip Concatenate', { axis: -1 });

  const decConvT2 = new Conv1DTransposeNode('n13', 'Decoder L1 Transpose', { filters: 8, kernelSize: 3, strides: 2, padding: 'same', activation: 'relu' });
  const skipConcat2 = new ConcatenateNode('n14', 'L1 Skip Concatenate', { axis: -1 });

  // --- OUT ---
  const reconstructionOutput = new Conv1DNode('n15', 'Rekonstrüksiyon Çıkışı', { filters: 1, kernelSize: 3, padding: 'same', activation: 'linear' });

  // Bağlantılar (Wiring)
  encConv1.connect('input', inputNode, 'output');
  encNorm1.connect('input', encConv1, 'output');
  encPool1.connect('input', encNorm1, 'output');

  encConv2.connect('input', encPool1, 'output');
  encNorm2.connect('input', encConv2, 'output');
  encPool2.connect('input', encNorm2, 'output');

  bottleneck.connect('input', encPool2, 'output'); // Latent representation: [batch, 16, 32]

  decConvT1.connect('input', bottleneck, 'output');
  
  // Skip L2: L2 Batch Norm (n8) + Decoder L2 Transpose (n11)
  skipConcat1.connect('input0', encNorm2, 'output');
  skipConcat1.connect('input1', decConvT1, 'output');

  decConvT2.connect('input', skipConcat1, 'output');

  // Skip L1: L1 Batch Norm (n5) + Decoder L1 Transpose (n13)
  skipConcat2.connect('input0', encNorm1, 'output');
  skipConcat2.connect('input1', decConvT2, 'output');

  reconstructionOutput.connect('input', skipConcat2, 'output');

  // =================================================================
  // 4. DERLEYİCİ VE SESSİZ EĞİTİM
  // =================================================================
  console.log("4. U-Net Autoencoder Derleniyor...");
  const compilerNode = new ModelCompilerNode('compiler', 'U-Net AE Derleyici', {
    optimizer: 'adam',
    loss: 'meanSquaredError'
  });
  compilerNode.connect('input0', inputNode, 'output');
  compilerNode.connect('output0', reconstructionOutput, 'output');

  compilerNode.clearCache();
  const { model } = compilerNode.resolve();
  console.log("   -> U-Net Autoencoder Yapısı:");
  model.summary();

  console.log("\n5. Denetimsiz Eğitim Başlatılıyor (xData = yData)...");
  const trainerNode = new ModelTrainerNode('trainer', 'U-Net AE Eğitici', {
    epochs: 15,
    batchSize: 8,
    validationSplit: 0.1
  });
  trainerNode.connect('model', compilerNode, 'model');
  trainerNode.connect('xData', { resolve: () => inputWindowTensor, port: 'output' });
  trainerNode.connect('yData', { resolve: () => inputWindowTensor, port: 'output' });

  trainerNode.clearCache();
  const trainResult = await trainerNode.resolveAsync();
  console.log("   -> Eğitim Tamamlandı! MSE Kaybı:", trainResult.history.history.loss[trainResult.history.history.loss.length - 1].toFixed(5));

  // =================================================================
  // 5. LATENT ÇIKARIM VE K-MEANS KÜMELEME
  // =================================================================
  console.log("\n6. Bottleneck Katmanından ('n10') Özellikler Çekiliyor...");
  const latentExtractorNode = new LatentExtractorNode('extractor', 'Bottleneck Çıkarıcı', {
    layerName: 'n10'
  });
  latentExtractorNode.connect('model', compilerNode, 'model');
  latentExtractorNode.connect('inputData', { resolve: () => inputWindowTensor, port: 'output' });

  latentExtractorNode.clearCache();
  const latentEmbeddings = latentExtractorNode.resolve('output');
  console.log(`   -> Çekilen Latent Boyutu: [${latentEmbeddings.shape}]`);

  console.log("\n7. KMeansClusteringNode ile Kümeleme Yapılıyor...");
  const flattenedEmbeddings = tf.tidy(() => {
    return latentEmbeddings.reshape([numWindows, -1]);
  });

  const kmeansNode = new KMeansClusteringNode('kmeans', 'Kümeleyici', { k: 3, maxIterations: 50 });
  kmeansNode.connect('embeddings', { resolve: () => flattenedEmbeddings, port: 'output' });
  kmeansNode.clearCache();
  const { output: clusterAssignments } = kmeansNode.resolve();

  // =================================================================
  // 6. REKONSTRÜKSİYON VE SINYAL ETİKETLEME
  // =================================================================
  console.log(`\n8. SignalMaskReconstructorNode ile Sürekli Sinyale Yansıtılıyor (Uzunluk: ${originalLength})...`);
  const reconstructorNode = new SignalMaskReconstructorNode('reconstructor', 'Etiket Yansıtıcı', {
    originalLength,
    windowSize,
    stride
  });
  reconstructorNode.connect('clusterIds', { resolve: () => clusterAssignments, port: 'output' });
  reconstructorNode.clearCache();
  const finalContinuousMask = reconstructorNode.resolve('output');

  console.log("%c   -> Segmentasyon Rekonstrüksiyonu Tamamlandı!", "color: #10b981; font-weight: bold;");

  // Bellek Temizleme
  tf.dispose([
    inputWindowTensor,
    latentEmbeddings,
    flattenedEmbeddings,
    model
  ]);
  console.log("\n9. TensorFlow.js Belleği Temizlendi.");
}

if (typeof window === 'undefined') {
  runUnsupervisedUnetSegmentation();
}

export { runUnsupervisedUnetSegmentation };
