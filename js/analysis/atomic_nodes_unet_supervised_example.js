/**
 * ATOMİK NODES U-NET NOKTASAL (SAMPLE-BY-SAMPLE) SÜPERVİZE SEGMENTASYON ÖRNEĞİ
 * ===========================================================================
 * 
 * Bu senaryoda, U-Net yapısı bir özellik çıkarıcı (unsupervised) olarak değil,
 * doğrudan sinyal üzerindeki her bir numuneyi (sample-by-sample) sınıflandıran 
 * süpervize bir yapay sinir ağı olarak kullanılır.
 * 
 * Akış Adımları:
 * 1. Sentetik bir sinyal üretilir (sinüs dalgası + belli bölgelerde yüksek genlikli peak'ler).
 * 2. Hedef (ground truth) maske oluşturulur: Peak genliğinin 3.0'dan büyük olduğu yerler 1 (pozitif), diğer yerler 0.
 * 3. Kayan pencereler üretilir: 
 *    - xData (Sinyal pencereleri): [numWindows, 64, 1]
 *    - yData (Hedef etiket pencereleri): [numWindows, 64, 1] (Noktasal / sample-by-sample hedef maske!)
 * 4. 1D U-Net mimarisi kurulur:
 *    - Giriş -> Conv1D -> MaxPooling1D -> Bottleneck -> Conv1DTranspose -> Skip Concatenate -> Conv1D (Sigmoid Çıkış: 'prediction_output')
 * 5. Model, Binary Crossentropy kaybı ile derlenir.
 * 6. ModelTrainerNode ile eğitilir.
 * 7. LatentExtractorNode, 'prediction_output' (yani nihai tahmin) katmanına yönlendirilerek modelin ürettiği olasılıklar [numWindows, 64, 1] çekilir.
 * 8. Geliştirdiğimiz SignalMaskReconstructorNode olasılıkları otomatik olarak 0.5 eşiği ile binary yapar, squeeze eder ve sürekli sinyale yansıtır.
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
  SignalMaskReconstructorNode
} = globalThis.AtomicNodes;

// TensorFlow.js'in yüklü olduğunu doğrula
const tf = typeof window !== 'undefined' && window.tf ? window.tf : (typeof globalThis !== 'undefined' ? globalThis.tf : null);

async function runSupervisedUnetSegmentation() {
  console.log("%c[Supervised U-Net Pointwise Segmentation] Başlatılıyor...", "color: #059669; font-weight: bold; font-size: 14px;");

  if (!tf) {
    console.error("TensorFlow.js bulunamadı! Lütfen '@tensorflow/tfjs' paketini kurun.");
    return;
  }

  // =================================================================
  // 1. SINYAL VE GROUND TRUTH MASKE ÜRETİMİ (SÜPERVİZE VERİ SETİ)
  // =================================================================
  const originalLength = 600;
  console.log(`\n1. Sinyal ve Noktasal Hedef Maskesi Oluşturuluyor...`);

  const syntheticSignal = new Float32Array(originalLength);
  const groundTruthMask = new Float32Array(originalLength);

  for (let i = 0; i < originalLength; i++) {
    // Baz yavaş sinüs dalgası
    let base = Math.sin(i * 0.05) * 2.0;
    
    // Belli bölgelerde yapay yüksek genlikli peak'ler (segmentler) ekliyoruz
    let peak = 0.0;
    let isPeak = false;
    
    if (i >= 120 && i <= 180) {
      peak = 6.0; // Peak bölgesi 1
      isPeak = true;
    } else if (i >= 350 && i <= 410) {
      peak = 8.0; // Peak bölgesi 2
      isPeak = true;
    }
    
    syntheticSignal[i] = base + peak + (Math.random() - 0.5) * 0.5; // Gürültülü sinyal
    groundTruthMask[i] = isPeak ? 1.0 : 0.0; // Örnek bazında (sample-by-sample) hedef etiket!
  }

  // =================================================================
  // 2. DSP DÜĞÜMÜ: SLIDING WINDOW (KAYAN PENCERE) SEGMENTASYONU
  // =================================================================
  const windowSize = 64;
  const stride = 16;
  console.log(`2. SlidingWindowNode ile Giriş Sinyali ve Hedef Maske Dilimleniyor (Window: ${windowSize}, Stride: ${stride})`);

  // Sinyal Pencereleri (X)
  const windowNodeX = new SlidingWindowNode('window_x', 'Sinyal Dilimleyici', { windowSize, stride });
  windowNodeX.connect('signal', { resolve: () => syntheticSignal, port: 'output' });
  const xWindowTensor = windowNodeX.resolve('output');

  // Hedef Maske Pencereleri (Y)
  const windowNodeY = new SlidingWindowNode('window_y', 'Maske Dilimleyici', { windowSize, stride });
  windowNodeY.connect('signal', { resolve: () => groundTruthMask, port: 'output' });
  const yWindowTensor = windowNodeY.resolve('output');

  const numWindows = xWindowTensor.shape[0];
  console.log(`   -> Dilimleme Başarılı!`);
  console.log(`   -> X Verisi Boyutu: [${xWindowTensor.shape}] (Giriş)`);
  console.log(`   -> Y Verisi Boyutu: [${yWindowTensor.shape}] (Sample-by-Sample Sınıf Etiketleri)`);

  // =================================================================
  // 3. 1D U-NET MİMARİSİNİN KURULMASI (WIRING)
  // =================================================================
  console.log("\n3. 1D U-Net Süpervize Ağ Mimarisi Kuruluyor...");

  const inputNode = new InputLayerNode('input_layer', 'Giriş Katmanı', {
    shape: [windowSize, 1]
  });

  // ENCODER (Downsampling)
  const encConv = new Conv1DNode('enc_conv', 'Encoder Evrişim', {
    filters: 8,
    kernelSize: 3,
    padding: 'same',
    activation: 'relu'
  });

  const encPool = new MaxPooling1DNode('enc_pool', 'Downsampling', {
    poolSize: 2,
    strides: 2,
    padding: 'same'
  });

  // BOTTLENECK (Dar Boğaz)
  const bottleneck = new Conv1DNode('bottleneck', 'U-Net Dar Boğaz', {
    filters: 16,
    kernelSize: 3,
    padding: 'same',
    activation: 'relu'
  });

  // DECODER (Upsampling)
  const decConvTranspose = new Conv1DTransposeNode('dec_conv_t', 'Decoder Evrişim (Upsample)', {
    filters: 8,
    kernelSize: 3,
    strides: 2,
    padding: 'same',
    activation: 'relu'
  });

  // SKIP CONNECTION CONCATENATION
  const skipConcatenate = new ConcatenateNode('skip_concat', 'U-Net Atlamalı Bağlantı', {
    axis: -1
  });

  // NOKTASAL TAHMİN KATMANI (1 filtre, Sigmoid)
  const predictionOutput = new Conv1DNode('prediction_output', 'Sınıflandırıcı Çıkış Katmanı', {
    filters: 1, // Her bir numunenin pozitif sınıf olma olasılığı (0.0 - 1.0)
    kernelSize: 1,
    padding: 'same',
    activation: 'sigmoid'
  });

  // Kabloları Bağla (Wiring)
  encConv.connect('input', inputNode, 'output');
  encPool.connect('input', encConv, 'output');
  bottleneck.connect('input', encPool, 'output');
  
  decConvTranspose.connect('input', bottleneck, 'output');
  
  // Skip connection: Encoder Conv çıktısı ile Decoder Transpose çıktısını birleştir
  skipConcatenate.connect('input0', encConv, 'output');
  skipConcatenate.connect('input1', decConvTranspose, 'output');
  
  predictionOutput.connect('input', skipConcatenate, 'output');

  // =================================================================
  // 4. MODEL COMPILER VE TRAINER DÜĞÜMLERİ
  // =================================================================
  console.log("4. Model Yapısı Derleniyor...");

  const compilerNode = new ModelCompilerNode('compiler', 'Supervised U-Net Derleyici', {
    optimizer: 'adam',
    loss: 'binaryCrossentropy', // İkili noktasal segmentasyon kaybı
    metrics: ['mae']
  });

  compilerNode.connect('input0', inputNode, 'output');
  compilerNode.connect('output0', predictionOutput, 'output');

  compilerNode.clearCache();
  const { model } = compilerNode.resolve();
  console.log("   -> U-Net Model Yapısı Hazır!");
  model.summary();

  // =================================================================
  // 5. ASENKRON SÜPERVİZE EĞİTİM (MODEL TRAINER)
  // =================================================================
  console.log("\n5. U-Net Modelinin Asenkron Eğitimi Başlıyor (Supervised Training)...");

  const trainerNode = new ModelTrainerNode('trainer', 'U-Net Eğitici', {
    epochs: 20, // Peak'leri öğrenmesi için 20 epoch yeterlidir
    batchSize: 8,
    validationSplit: 0.1
  });

  trainerNode.connect('model', compilerNode, 'model');
  trainerNode.connect('xData', { resolve: () => xWindowTensor, port: 'output' });
  trainerNode.connect('yData', { resolve: () => yWindowTensor, port: 'output' });

  trainerNode.clearCache();
  const trainResult = await trainerNode.resolveAsync();
  console.log("   -> U-Net Eğitimi Tamamlandı!");
  console.log("   -> Son Epoch Kaybı (Binary Crossentropy):", trainResult.history.history.loss[trainResult.history.history.loss.length - 1].toFixed(5));

  // =================================================================
  // 6. MODEL TAHMİNİ (INFERENCE VIA LATENT EXTRACTOR)
  // =================================================================
  console.log("\n6. Model Tahminleri (Inference) Üretiliyor...");
  
  // LatentExtractorNode'u modelimizin en son çıkış katmanı olan 'prediction_output' katmanına
  // bağlayarak modelin ürettiği ham sigmoid çıktı olasılıklarını [numWindows, 64, 1] alıyoruz.
  const inferenceNode = new LatentExtractorNode('inference', 'U-Net Tahmin Alıcı', {
    layerName: 'prediction_output'
  });

  inferenceNode.connect('model', compilerNode, 'model');
  inferenceNode.connect('inputData', { resolve: () => xWindowTensor, port: 'output' });

  inferenceNode.clearCache();
  const rawProbabilities = inferenceNode.resolve('output');
  console.log(`   -> Tahminler Başarıyla Üretildi! Çıktı Boyutu: [${rawProbabilities.shape}]`);

  // =================================================================
  // 7. SİNYAL TAHMİN MASKESİ PROJEKSİYONU (SAMPLE-BY-SAMPLE RECONSTRUCTION)
  // =================================================================
  console.log(`\n7. SignalMaskReconstructorNode ile Noktasal Tahminler Sinyal Boyutuna (${originalLength}) Geri Yansıtılıyor...`);
  console.log("   -> Yenilenen algoritma olasılıkları otomatik olarak 0.5 eşiği ile binary yapacaktır.");

  const reconstructorNode = new SignalMaskReconstructorNode('reconstructor', 'Noktasal Tahmin Yansıtıcı', {
    originalLength,
    windowSize,
    stride,
    threshold: 0.5 // Sigmoid olasılıkları 0.5'ten büyükse peak (1), küçükse arka plan (0)
  });

  reconstructorNode.connect('clusterIds', { resolve: () => rawProbabilities, port: 'output' });

  reconstructorNode.clearCache();
  const finalContinuousMask = reconstructorNode.resolve('output');

  console.log("%c   -> Noktasal Maske Rekonstrüksiyonu Tamamlandı!", "color: #10b981; font-weight: bold;");

  // Örnek doğruluk kontrolü yapalım
  let truePositives = 0, falsePositives = 0, trueNegatives = 0, falseNegatives = 0;
  for (let i = 0; i < originalLength; i++) {
    const gt = groundTruthMask[i];
    const pred = finalContinuousMask[i];
    if (gt === 1.0 && pred === 1) truePositives++;
    else if (gt === 0.0 && pred === 1) falsePositives++;
    else if (gt === 0.0 && pred === 0) trueNegatives++;
    else if (gt === 1.0 && pred === 0) falseNegatives++;
  }

  const accuracy = ((truePositives + trueNegatives) / originalLength) * 100;
  console.log(`   -> Segmentasyon Örnek Bazlı Doğruluk Oranı (Accuracy): %${accuracy.toFixed(2)}`);
  console.log(`   -> Peak Bölgeleri Yakalama Hassasiyeti: TP = ${truePositives} örnek, FN = ${falseNegatives} örnek`);

  // =================================================================
  // BELLEK TEMİZLİĞİ (CLEANUP)
  // =================================================================
  tf.dispose([
    xWindowTensor,
    yWindowTensor,
    rawProbabilities,
    model
  ]);
  console.log("\n8. TensorFlow.js Bellek Temizliği Yapıldı.");
  console.log("%c[Supervised U-Net Pointwise Segmentation] Süreç Başarıyla Bitti!", "color: #10b981; font-weight: bold; font-size: 14px;");
}

// Global scope veya modüler ortam tetikleyicisi
if (typeof window === 'undefined') {
  runSupervisedUnetSegmentation();
}

export { runSupervisedUnetSegmentation };
