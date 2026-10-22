/**
 * ATOMİK NODE ZAMAN SERİSİ DERİN ÖĞRENME VE SİNYAL İŞLEME KÜTÜPHANESİ
 * =================================================================
 * 
 * Bu kütüphane; TensorFlow.js Functional API katmanlarını ve sinyal işleme (DSP) 
 * adımlarını görsel veya kod tabanlı bir "Node Graph" (Düğümler Grafiği) mimarisiyle 
 * kurmak için tasarlanmıştır. 
 * 
 * ES6/ESNext standartlarında, saf JavaScript ile yazılmıştır. Bellek sızıntılarını 
 * önlemek amacıyla gelişmiş TensorFlow.js bellek yönetimini (tf.tidy ve .dispose()) 
 * barındırır.
 */

// TensorFlow.js'in global veya modüler ortamda yüklü olup olmadığını doğrula
const tf = typeof window !== 'undefined' && window.tf ? window.tf : (typeof globalThis !== 'undefined' ? globalThis.tf : null);
if (!tf) {
  console.warn("TensorFlow.js algılanamadı! Derin öğrenme düğümlerini (Nodes) çalıştırmadan önce lütfen @tensorflow/tfjs kütüphanesini yükleyin.");
}

// ==========================================
// CORE / BASE NODE ABSTRACTION
// ==========================================

/**
 * Tüm düğümlerin türeyeceği soyut temel sınıf.
 * Giriş-çıkış portları, parametreler ve DAG (Directed Acyclic Graph)
 * üzerindeki çalışma önbellek (cache) yönetimini yürütür.
 */
class BaseNode {
  /**
   * @param {string} id - Düğümün benzersiz kimliği (örn: 'conv1d_2')
   * @param {string} name - Düğümün adı (örn: 'Conv1D Katmanı')
   * @param {Object} params - Düğüme ait hiperparametreler
   */
  constructor(id, name, params = {}) {
    this.id = id;
    this.name = name;
    this.params = params;
    this.inputs = {};       // format: { portName: { node: BaseNode, port: 'output' } }
    this.outputCache = {};  // Düğümün bu iterasyonda ürettiği değerleri önbelleğe alır
  }

  /**
   * Bir düğümün giriş portunu başka bir düğümün çıkış portuna bağlar.
   * @param {string} inputPort - Kendi giriş portumuzun adı (örn: 'input')
   * @param {BaseNode} targetNode - Bağlanılacak hedef düğüm
   * @param {string} targetOutputPort - Hedef düğümün çıkış portu (varsayılan: 'output')
   * @returns {BaseNode} - Fluent API desteği için self döner
   */
  connect(inputPort, targetNode, targetOutputPort = 'output') {
    this.inputs[inputPort] = { node: targetNode, port: targetOutputPort };
    return this;
  }

  /**
   * Grafikteki tüm düğümlerin önbelleğini temizler.
   * Yeni bir ileri besleme (forward pass) öncesi çağrılmalıdır.
   */
  clearCache() {
    this.outputCache = {};
  }

  /**
   * Düğümün belirli bir çıkış portunun değerini özyinelemeli (recursive) olarak çözer.
   * @param {string} portName - Çözülecek portun adı
   * @returns {*} - Çözülen Tensor veya veri
   */
  resolve(portName = 'output') {
    // Eğer bu portun değeri zaten hesaplanmış ve önbelleğe alınmışsa doğrudan dön (DAG optimizasyonu)
    if (this.outputCache[portName] !== undefined) {
      return this.outputCache[portName];
    }

    // Bu düğüme bağlı olan tüm girdi portlarını özyinelemeli olarak çöz
    const resolvedInputs = {};
    for (const [port, conn] of Object.entries(this.inputs)) {
      resolvedInputs[port] = conn.node.resolve(conn.port);
    }

    // Düğümün kendi özel mantığını çalıştır
    const outputs = this.execute(resolvedInputs);
    
    // Çıktıları önbelleğe yaz
    const isTensor = outputs && (
      (tf && (outputs instanceof tf.Tensor || (tf.SymbolicTensor && outputs instanceof tf.SymbolicTensor))) ||
      (outputs.constructor && (outputs.constructor.name === 'Tensor' || outputs.constructor.name === 'SymbolicTensor')) ||
      (typeof outputs.dataSync === 'function' && typeof outputs.dispose === 'function')
    );

    if (outputs && typeof outputs === 'object' && !isTensor) {
      this.outputCache = { ...this.outputCache, ...outputs };
    } else {
      this.outputCache[portName] = outputs;
    }

    return this.outputCache[portName];
  }

  /**
   * Alt sınıflar tarafından ezilmesi zorunlu olan çalıştırma mantığı.
   * @param {Object} inputs - Çözülmüş girdi değerleri/tensorleri sözlüğü
   * @returns {Object|*} - Düğüm çıktıları
   */
  execute(inputs) {
    throw new Error(`[BaseNode] execute() metodu '${this.name}' (${this.id}) sınıfında implement edilmemiş!`);
  }
}

// ==========================================
// CORE & SHAPE NODES (TEMEL VE ŞEKİLLENDİRME)
// ==========================================

/**
 * Modelin giriş tensorünü (tf.SymbolicTensor) tanımlar.
 */
class InputLayerNode extends BaseNode {
  execute(inputs) {
    const { shape, dtype = 'float32', name } = this.params;
    if (!shape || !Array.isArray(shape)) {
      throw new Error(`InputLayerNode [${this.id}] geçerli bir 'shape' parametresi gerektirir (örn: [128, 1]).`);
    }

    // TF.js Functional API Giriş Katmanı
    const symbolicTensor = tf.input({
      shape,
      dtype,
      name: name || this.id
    });

    return { output: symbolicTensor };
  }
}

// ==========================================
// CONVOLUTION & POOLING NODES
// ==========================================

/**
 * 1D Evrişim (Convolution) Katmanı Düğümü.
 * Sinyal üzerindeki yerel özellikleri çıkarır.
 */
class Conv1DNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`Conv1DNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    const {
      filters,
      kernelSize,
      strides = 1,
      padding = 'same',
      activation = 'relu',
      useBias = true,
      kernelInitializer = 'glorotNormal'
    } = this.params;

    if (filters === undefined || kernelSize === undefined) {
      throw new Error(`Conv1DNode [${this.id}] 'filters' ve 'kernelSize' parametrelerini içermelidir.`);
    }

    // TensorFlow.js 1D Convolution katmanını oluştur
    this.layer = tf.layers.conv1d({
      filters,
      kernelSize,
      strides,
      padding,
      activation,
      useBias,
      kernelInitializer,
      name: this.id // Katman ismini düğüm kimliği yaparak sonradan erişilebilir kılacağız
    });

    // Sembolik tensöre katmanı uygula
    const outputTensor = this.layer.apply(inputTensor);
    return { output: outputTensor };
  }
}

/**
 * 1D En Büyük Ortaklama (MaxPooling) Katmanı Düğümü.
 * Özellik haritalarının zamansal boyutunu indirger.
 */
class MaxPooling1DNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`MaxPooling1DNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    const { poolSize = 2, strides = 2, padding = 'valid' } = this.params;

    this.layer = tf.layers.maxPooling1d({
      poolSize,
      strides,
      padding,
      name: this.id
    });

    const outputTensor = this.layer.apply(inputTensor);
    return { output: outputTensor };
  }
}

/**
 * 1D Evrişimli Transpoze (Conv1D Transpose) Katmanı Düğümü.
 * U-Net gibi segmentasyon ağlarında yukarı örnekleme (upsampling) ve öğrenilebilir kod çözme yapar.
 * 
 * MATEMATİKSEL İLLÜZYON (WORKAROUND):
 * TensorFlow.js kütüphanesinde doğrudan yüksek seviyeli `tf.layers.conv1dTranspose` katmanı YOKTUR.
 * Bu sınıfta, modelin tamamen yerel TF.js katmanları ile serileştirilebilir (saved/loaded) kalabilmesi 
 * için şu özgün 3 adımlı katman kompozisyonunu uyguluyoruz:
 * 1. Reshape Layer: 1D Sinyal Tensörünü `[length, channels]` -> `[length, 1, channels]` (2D) şekline sokar.
 * 2. Conv2DTranspose Layer: Kernel boyutu `[kernelSize, 1]` ve stride `[strides, 1]` olan 2B ters evrişim uygulayarak zamansal boyutu büyütür.
 * 3. Reshape Layer: `[newLength, 1, filters]` -> `[newLength, filters]` (1D) olarak geri düzleştirir.
 */
class Conv1DTransposeNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`Conv1DTransposeNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    const {
      filters,
      kernelSize,
      strides = 1,
      padding = 'same',
      activation = 'relu'
    } = this.params;

    if (filters === undefined || kernelSize === undefined) {
      throw new Error(`Conv1DTransposeNode [${this.id}] 'filters' ve 'kernelSize' parametrelerini içermelidir.`);
    }

    // 1. ADIM: 1D -> 2D Boyut Değişimi
    // Sembolik tensörün boyutunu [null, length, channels] -> [null, length, 1, channels] yapar.
    const inputLength = inputTensor.shape[1] || -1;
    const inputChannels = inputTensor.shape[2] || 1;
    const reshape2D = tf.layers.reshape({
      targetShape: [inputLength, 1, inputChannels],
      name: `${this.id}_reshape_2d`
    });

    // 2. ADIM: 2D Transposed Convolution
    // Dikey eksende upsampling yapar, yatay ekseni (genişlik = 1) sabit tutar.
    const conv2dTranspose = tf.layers.conv2dTranspose({
      filters,
      kernelSize: [kernelSize, 1],
      strides: [strides, 1],
      padding,
      activation,
      name: `${this.id}_conv2d_transpose`
    });

    // Çıkış uzunluğunu kesin olarak hesapla (böylece Concatenate katmanında null boyut uyuşmazlığı olmaz)
    let newLength = -1;
    if (inputLength !== -1 && inputLength !== null && inputLength !== undefined) {
      if (padding === 'same') {
        newLength = inputLength * strides;
      } else {
        newLength = (inputLength - 1) * strides + kernelSize;
      }
    }

    // 3. ADIM: 2D -> 1D Geri Dönüşüm
    // [null, newLength, 1, filters] -> [null, newLength, filters]
    const reshape1D = tf.layers.reshape({
      targetShape: [newLength !== -1 ? newLength : -1, filters],
      name: this.id // Katman ismini düğüm kimliği yaparak modelde bu isimle kaydederiz
    });

    // Sembolik katman zincirini işlet
    let x = reshape2D.apply(inputTensor);
    x = conv2dTranspose.apply(x);
    x = reshape1D.apply(x);

    return { output: x };
  }
}

// ==========================================
// MERGE / TOPOLOGY NODES (BİRLEŞTİRME VE ATLAMALI BAĞLANTI)
// ==========================================

/**
 * Birden fazla sembolik tensörü kanal ekseninde (axis=-1) uç uca birleştiren düğüm.
 * U-Net mimarisindeki atlamalı bağlantıların (Skip Connections) kurulması için kritiktir.
 */
class ConcatenateNode extends BaseNode {
  execute(inputs) {
    // 'input0', 'input1', 'input2' gibi adlandırılmış veya sıralı tüm sembolik girdileri topla
    const inputTensors = Object.keys(inputs)
      .filter(key => key.startsWith('input'))
      .sort()
      .map(key => inputs[key]);

    if (inputTensors.length < 2) {
      throw new Error(`ConcatenateNode [${this.id}] en az 2 giriş symbolic tensörü gerektirir (örn: 'input0', 'input1').`);
    }

    const axis = this.params.axis !== undefined ? this.params.axis : -1;

    this.layer = tf.layers.concatenate({
      axis,
      name: this.id
    });

    const outputTensor = this.layer.apply(inputTensors);
    return { output: outputTensor };
  }
}

// ==========================================
// MODEL COMPILER & TRAINER NODES
// ==========================================

/**
 * Node Graph'ında geriye doğru giderek giriş ve çıkış symbolic tensorlerini çözer,
 * ve tf.model({inputs, outputs}) fonksiyonel modelini derler.
 */
class ModelCompilerNode extends BaseNode {
  execute(inputs) {
    // compiler.connect('input0', inputNode) ve compiler.connect('output0', outputNode) bağlantılarını al
    const inputTensors = Object.keys(inputs)
      .filter(key => key.startsWith('input'))
      .sort()
      .map(key => inputs[key]);

    const outputTensors = Object.keys(inputs)
      .filter(key => key.startsWith('output'))
      .sort()
      .map(key => inputs[key]);

    if (inputTensors.length === 0 || outputTensors.length === 0) {
      throw new Error(`ModelCompilerNode [${this.id}] en az bir 'input0' ve bir 'output0' symbolic tensör girişi almalıdır.`);
    }

    const {
      optimizer = 'adam',
      loss = 'meanSquaredError',
      metrics = ['accuracy']
    } = this.params;

    // Fonksiyonel Model Tanımlama
    const model = tf.model({
      inputs: inputTensors.length === 1 ? inputTensors[0] : inputTensors,
      outputs: outputTensors.length === 1 ? outputTensors[0] : outputTensors
    });

    // Modeli optimizer ve loss ile derle
    model.compile({
      optimizer,
      loss,
      metrics
    });

    return { model };
  }
}

/**
 * Derlenen modeli X ve Y veri tensorleri ile asenkron eğiten düğüm.
 */
class ModelTrainerNode extends BaseNode {
  async executeAsync(inputs, uiNode = null) {
    const { model, xData, yData } = inputs;
    const {
      epochs = 10,
      batchSize = 32,
      validationSplit = 0.1,
      earlyStopping = false,
      patience = 5,
      monitor = 'val_loss',
      minDelta = 0.0001,
      trainModel = true
    } = this.params;

    if (!model) {
      throw new Error(`ModelTrainerNode [${this.id}] girdi olarak derlenmiş bir 'model' almalıdır.`);
    }

    const shouldTrain = trainModel !== false && trainModel !== 'false';
    if (!shouldTrain) {
      if (uiNode && uiNode.el) {
        const prevContainer = uiNode.el.querySelector('.ne-trainer-container');
        if (prevContainer) prevContainer.remove();

        const container = document.createElement('div');
        container.className = 'ne-trainer-container';
        container.style.marginTop = '10px';
        container.style.padding = '8px';
        container.style.background = 'rgba(0, 188, 212, 0.2)';
        container.style.borderRadius = '6px';
        container.style.fontSize = '0.75rem';
        container.style.color = '#00bcd4';
        container.style.textAlign = 'center';
        container.style.margin = '10px 12px 6px 12px';
        container.textContent = 'Training skipped. Reusing existing model weights.';

        const paramsEl = uiNode.el.querySelector('.ne-node-params');
        if (paramsEl) {
          uiNode.el.insertBefore(container, paramsEl);
        } else {
          uiNode.el.appendChild(container);
        }
      }
      return { model, history: null };
    }

    if (!xData || !yData) {
      throw new Error(`ModelTrainerNode [${this.id}] 'xData' ve 'yData' eğitim verilerini gerektirir.`);
    }

    let container = null;
    let statusText = null;
    let progressBar = null;
    let lossLabel = null;
    let valLossLabel = null;
    let svgElement = null;
    let stopBtn = null;

    this.stopRequested = false;

    if (uiNode && uiNode.el) {
      // Clean up previous container if exists
      const prevContainer = uiNode.el.querySelector('.ne-trainer-container');
      if (prevContainer) {
        prevContainer.remove();
      }

      container = document.createElement('div');
      container.className = 'ne-trainer-container';
      container.style.marginTop = '10px';
      container.style.padding = '8px';
      container.style.background = 'rgba(0,0,0,0.2)';
      container.style.borderRadius = '6px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '6px';
      container.style.width = 'calc(100% - 24px)';
      container.style.margin = '10px 12px 6px 12px';
      container.style.boxSizing = 'border-box';
      
      // Insert container right before the parameter section if exists, or append
      const paramsEl = uiNode.el.querySelector('.ne-node-params');
      if (paramsEl) {
        uiNode.el.insertBefore(container, paramsEl);
      } else {
        uiNode.el.appendChild(container);
      }

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; font-weight:600; color:var(--text-main);">
          <span class="ne-trainer-status">Preparing...</span>
          <button class="ne-trainer-stop-btn" style="background:#ef4444; border:none; color:white; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.65rem; transition: background 0.2s;">Stop</button>
        </div>
        <div style="background:var(--border-color); height:4px; border-radius:2px; overflow:hidden;">
          <div class="ne-trainer-progress" style="background:var(--accent-color); width:0%; height:100%; transition:width 0.1s;"></div>
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); display:flex; justify-content:space-between;">
          <span class="ne-trainer-loss-label">Loss: -</span>
          <span class="ne-trainer-val-loss-label">Val Loss: -</span>
        </div>
        <div class="ne-trainer-chart-wrap" style="height:90px; margin-top:4px; position:relative; overflow:hidden;">
          <svg class="ne-trainer-svg" width="100%" height="90" style="background:rgba(0,0,0,0.3); border-radius:4px; overflow:hidden; display:block;"></svg>
        </div>
      `;

      statusText = container.querySelector('.ne-trainer-status');
      progressBar = container.querySelector('.ne-trainer-progress');
      lossLabel = container.querySelector('.ne-trainer-loss-label');
      valLossLabel = container.querySelector('.ne-trainer-val-loss-label');
      svgElement = container.querySelector('.ne-trainer-svg');
      stopBtn = container.querySelector('.ne-trainer-stop-btn');

      stopBtn.onclick = () => {
        this.stopRequested = true;
        stopBtn.textContent = 'Stopping...';
        stopBtn.disabled = true;
        stopBtn.style.background = '#9ca3af';
      };
    }

    const losses = [];
    const valLosses = [];

    // Early Stopping variables
    let bestValue = Infinity;
    let patienceCounter = 0;
    let bestWeights = null;
    let earlyStopped = false;

    const isEarlyStopEnabled = earlyStopping === true || earlyStopping === 'true';
    const actualMonitor = (validationSplit > 0) ? monitor : 'loss';

    const history = await model.fit(xData, yData, {
      epochs,
      batchSize,
      validationSplit,
      verbose: 0,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          if (this.stopRequested) {
            model.stopTraining = true;
            if (statusText) statusText.textContent = 'Stopped.';
            return;
          }

          const currentLoss = logs.loss;
          const currentValLoss = logs.val_loss;

          losses.push(currentLoss);
          if (currentValLoss !== undefined) {
            valLosses.push(currentValLoss);
          }

          // Early Stopping Logic
          if (isEarlyStopEnabled) {
            const monitoredVal = (actualMonitor === 'val_loss') ? currentValLoss : currentLoss;
            if (monitoredVal !== undefined) {
              if (monitoredVal < bestValue - minDelta) {
                bestValue = monitoredVal;
                patienceCounter = 0;
                // Save best weights
                if (bestWeights) {
                  bestWeights.forEach(t => t.dispose());
                }
                bestWeights = model.getWeights().map(w => w.clone());
              } else {
                patienceCounter++;
                if (patienceCounter >= patience) {
                  earlyStopped = true;
                  model.stopTraining = true;
                  if (statusText) statusText.textContent = `Early Stopped!`;
                }
              }
            }
          }

          // Update UI
          if (uiNode && container) {
            const progressPct = ((epoch + 1) / epochs) * 100;
            if (progressBar) progressBar.style.width = `${progressPct}%`;
            if (statusText && !earlyStopped) {
              statusText.textContent = `Epoch ${epoch + 1}/${epochs}`;
            }

            if (lossLabel) {
              lossLabel.textContent = `Loss: ${currentLoss.toFixed(4)}`;
            }
            
            if (currentValLoss !== undefined) {
              if (valLossLabel) {
                valLossLabel.textContent = `Val Loss: ${currentValLoss.toFixed(4)}`;
                valLossLabel.style.display = 'block';
              }
            } else if (valLossLabel) {
              valLossLabel.style.display = 'none';
            }

            // Draw line chart in SVG
            if (svgElement) {
              const svgW = (svgElement.parentNode ? svgElement.parentNode.clientWidth : 0) || svgElement.clientWidth || 180;
              const svgH = 90;
              
              // Find min/max values across both series for autoscaling
              const allVals = [...losses, ...valLosses];
              const minVal = Math.min(...allVals);
              const maxVal = Math.max(...allVals);
              
              const getPath = (data) => {
                if (data.length === 0) return '';
                const range = maxVal - minVal;
                const paddingX = 4;
                const paddingY = 8;
                const chartW = svgW - paddingX * 2;
                const chartH = svgH - paddingY * 2;
                
                return data.map((val, idx) => {
                  const x = paddingX + (idx / Math.max(1, data.length - 1)) * chartW;
                  const y = paddingY + chartH - ((val - minVal) / Math.max(1e-6, range)) * chartH;
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(' ');
              };

              const lossPathD = getPath(losses);
              const valLossPathD = getPath(valLosses);

              svgElement.innerHTML = `
                <!-- Grid Lines -->
                <line x1="0" y1="22" x2="${svgW}" y2="22" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
                <line x1="0" y1="45" x2="${svgW}" y2="45" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
                <line x1="0" y1="67" x2="${svgW}" y2="67" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
                
                <!-- Loss Line (Purple) -->
                ${lossPathD ? `<path d="${lossPathD}" fill="none" stroke="#7c4dff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />` : ''}
                
                <!-- Val Loss Line (Green) -->
                ${valLossPathD ? `<path d="${valLossPathD}" fill="none" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2" />` : ''}

                <!-- Min/Max text labels -->
                <text x="5" y="15" fill="rgba(255,255,255,0.4)" font-size="8px">Max: ${maxVal.toFixed(4)}</text>
                <text x="5" y="${svgH - 5}" fill="rgba(255,255,255,0.4)" font-size="8px">Min: ${minVal.toFixed(4)}</text>
              `;
            }
          }
          
          // Let UI thread breathe
          if (tf && tf.nextFrame) {
            await tf.nextFrame();
          } else {
            await new Promise(r => setTimeout(r, 0));
          }
        }
      }
    });

    // Restore best weights if early stopped or manually stopped
    if (isEarlyStopEnabled && bestWeights) {
      model.setWeights(bestWeights);
      bestWeights.forEach(t => t.dispose());
    }

    if (stopBtn) {
      stopBtn.style.display = 'none';
    }

    if (statusText) {
      if (earlyStopped) {
        statusText.textContent = 'Early Stopped.';
        statusText.style.color = '#ffb300';
      } else if (this.stopRequested) {
        statusText.textContent = 'Stopped.';
        statusText.style.color = '#f44336';
      } else {
        statusText.textContent = 'Success.';
        statusText.style.color = '#4caf50';
      }
    }

    return { model, history };
  }

  // Asenkron grafik çözümleme desteği
  async resolveAsync(portName = 'output') {
    if (this.outputCache[portName] !== undefined) {
      return this.outputCache[portName];
    }

    const resolvedInputs = {};
    for (const [port, conn] of Object.entries(this.inputs)) {
      resolvedInputs[port] = conn.node.resolveAsync
        ? await conn.node.resolveAsync(conn.port)
        : conn.node.resolve(conn.port);
    }

    const result = await this.executeAsync(resolvedInputs);
    
    if (result && typeof result === 'object') {
      this.outputCache = { ...this.outputCache, ...result };
    } else {
      this.outputCache[portName] = result;
    }

    return this.outputCache[portName];
  }
}

/**
 * Eğitilmiş modeldeki belirli bir ara katmandan (örn: bottleneck / encoder çıkışı)
 * aktivasyon vektörlerini (embeddings) güvenli bir şekilde çeker.
 */
class LatentExtractorNode extends BaseNode {
  execute(inputs) {
    const { model, inputData } = inputs;
    const { layerName } = this.params;

    if (!model) {
      throw new Error(`LatentExtractorNode [${this.id}] girdi olarak bir 'model' almalıdır.`);
    }
    if (!inputData) {
      throw new Error(`LatentExtractorNode [${this.id}] çıkarım için 'inputData' gerektirir.`);
    }
    if (!layerName) {
      throw new Error(`LatentExtractorNode [${this.id}] parametre olarak bir 'layerName' (örn: bottleneck katman ismi) almalıdır.`);
    }

    // Hedef katmanı model içerisinden çek
    const targetLayer = model.getLayer(layerName);
    if (!targetLayer) {
      throw new Error(`Model içerisinde '${layerName}' isimli bir katman bulunamadı.`);
    }

    // Bellek sızıntılarını önlemek için tf.tidy kullanımı
    const latentTensor = tf.tidy(() => {
      // Ara model oluştur: Girişleri orijinal modelle aynı, çıkışı hedef katmanın çıkışı
      const subModel = tf.model({
        inputs: model.inputs,
        outputs: targetLayer.output
      });

      // İlgili katmanın aktivasyon vektörlerini tahmin et
      const prediction = subModel.predict(inputData);
      
      // Tahmin edilen tensörü klonlayarak tf.tidy dışına sızdır (dışarıda manuel dispose edilmelidir!)
      return prediction.clone();
    });

    return { output: latentTensor };
  }
}

// ==========================================
// DSP PRE-PROCESSING NODES
// ==========================================

/**
 * Zaman serisi verilerini kayan pencere (sliding window) yaklaşımıyla segmentlere ayırır.
 * 1D sinyal serisini `[numWindows, windowSize, 1]` boyutunda 3B tensöre dönüştürür.
 */
class SlidingWindowNode extends BaseNode {
  execute(inputs) {
    const { signal } = inputs;
    const { windowSize, stride = 1 } = this.params;

    if (!signal) {
      throw new Error(`SlidingWindowNode [${this.id}] girdi olarak 'signal' almalıdır.`);
    }
    if (!windowSize) {
      throw new Error(`SlidingWindowNode [${this.id}] 'windowSize' parametresi gerektirir.`);
    }

    // Tensör ise düz diziye dönüştür
    const array = signal.arraySync ? signal.arraySync() : Array.from(signal);
    const windows = [];
    const len = array.length;

    for (let i = 0; i <= len - windowSize; i += stride) {
      const windowSegment = array.slice(i, i + windowSize);
      // Tek kanal (channel=1) boyutunu ekle: [windowSize, 1]
      windows.push(windowSegment.map(val => [val]));
    }

    // 3B TensorFlow tensörü oluştur: [pencereSayısı, pencereBoyutu, kanalSayısı]
    const windowTensor = tf.tensor3d(windows);
    return { output: windowTensor };
  }
}

// ==========================================
// CLUSTERING & POST-PROCESSING NODES
// ==========================================

/**
 * Saf JavaScript tabanlı yüksek performanslı K-Means kümeleme katmanı.
 * Ara katmandan çekilen latent embedding vektörlerini K gruba ayırır.
 */
class KMeansClusteringNode extends BaseNode {
  execute(inputs) {
    const { embeddings } = inputs;
    const { k = 3, maxIterations = 100 } = this.params;

    if (!embeddings) {
      throw new Error(`KMeansClusteringNode [${this.id}] girdi olarak 'embeddings' almalıdır.`);
    }

    // Latent vektörleri 2B diziye dönüştür
    const data = embeddings.arraySync ? embeddings.arraySync() : embeddings;
    const numSamples = data.length;

    if (numSamples === 0) {
      return { output: [], centroids: [] };
    }

    // Boyut doğrulaması (Sıfır boyuta karşı koruma)
    const dim = (data[0] && data[0].length) ? data[0].length : 0;
    if (dim === 0) {
      return { output: new Array(numSamples).fill(0), centroids: [] };
    }

    // Hiperparametre K doğrulaması (Negatif veya geçersiz değerlere karşı koruma)
    const parsedK = Math.max(1, parseInt(k) || 3);

    // 1. Rastgele ilk K merkez (Centroid) seçimi
    const centroids = [];
    const chosenIndices = new Set();
    while (centroids.length < parsedK && centroids.length < numSamples) {
      const randIdx = Math.floor(Math.random() * numSamples);
      if (!chosenIndices.has(randIdx)) {
        chosenIndices.add(randIdx);
        // Örnek veriyi kopyala ve NaN değerlere karşı temizle (0 ile doldur)
        const sample = data[randIdx] ? [...data[randIdx]] : new Array(dim).fill(0);
        for (let d = 0; d < dim; d++) {
          if (sample[d] === undefined || sample[d] === null || isNaN(sample[d])) {
            sample[d] = 0;
          }
        }
        centroids.push(sample);
      }
    }

    // Herhangi bir nedenden dolayı merkez kümesi boş kalırsa koruma sağla
    if (centroids.length === 0) {
      return { output: new Array(numSamples).fill(0), centroids: [] };
    }

    // Varsayılan olarak ilk merkez indeksini ata (böylece -1 out-of-bounds hatası önlenir)
    let assignments = new Array(numSamples).fill(0);
    let changed = true;
    let iter = 0;

    // Öklid mesafesi hesaplama yardımcısı (NaN ve geçersiz sayılara karşı korumalı)
    const euclideanDistance = (p1, p2) => {
      let sum = 0;
      for (let d = 0; d < dim; d++) {
        const val1 = (p1 && !isNaN(p1[d])) ? p1[d] : 0;
        const val2 = (p2 && !isNaN(p2[d])) ? p2[d] : 0;
        sum += (val1 - val2) * (val1 - val2);
      }
      return Math.sqrt(sum);
    };

    // K-Means ana döngüsü
    while (changed && iter < maxIterations) {
      changed = false;
      iter++;

      // A. AŞAMA: Her noktayı en yakın merkeze ata
      for (let i = 0; i < numSamples; i++) {
        const point = data[i];
        let minDist = Infinity;
        let bestCentroid = 0; // -1 yerine 0 atayarak tanımsızlık/çökme önlenir

        for (let c = 0; c < centroids.length; c++) {
          const d = euclideanDistance(point, centroids[c]);
          if (!isNaN(d) && d < minDist) {
            minDist = d;
            bestCentroid = c;
          }
        }

        if (assignments[i] !== bestCentroid) {
          assignments[i] = bestCentroid;
          changed = true;
        }
      }

      // B. AŞAMA: Yeni merkezleri (Centroids) hesapla
      const newCentroids = Array.from({ length: centroids.length }, () => new Array(dim).fill(0));
      const counts = new Array(centroids.length).fill(0);

      for (let i = 0; i < numSamples; i++) {
        const c = assignments[i];
        // İndeks sınır kontrolü (out-of-bounds guard)
        if (c >= 0 && c < newCentroids.length) {
          counts[c]++;
          for (let d = 0; d < dim; d++) {
            const val = (data[i] && !isNaN(data[i][d])) ? data[i][d] : 0;
            newCentroids[c][d] += val;
          }
        }
      }

      for (let c = 0; c < centroids.length; c++) {
        if (counts[c] > 0) {
          for (let d = 0; d < dim; d++) {
            centroids[c][d] = newCentroids[c][d] / counts[c];
          }
        }
      }
    }

    return { output: assignments, centroids };
  }
}

/**
 * Nokta düzeyinde (Point-wise / Dense) K-Means kümeleme katmanı.
 * Girdi olarak [numWindows, windowSize, numChannels] boyutunda dense latent embedding alır.
 * Her bir örneklem noktasını (sample) ayrı bir veri noktası olarak kabul eder ve kümeleme yapar.
 * Çıktı olarak [numWindows, windowSize] boyutunda nokta düzeyinde küme etiketleri döner.
 */
class DenseKMeansClusteringNode extends BaseNode {
  execute(inputs) {
    const { embeddings } = inputs;
    const { k = 3, maxIterations = 50 } = this.params;

    if (!embeddings) {
      throw new Error(`DenseKMeansClusteringNode [${this.id}] girdi olarak 'embeddings' almalıdır.`);
    }

    // Tensör ise diziye çevir
    let data = embeddings;
    let shape = [];
    if (tf && data instanceof tf.Tensor) {
      shape = data.shape; // [numWindows, windowSize, numChannels]
      data = data.arraySync();
    } else if (data.arraySync) {
      shape = data.shape;
      data = data.arraySync();
    } else {
      // Düz JS dizisi ise şeklini çıkaralım
      const numWindows = data.length;
      const windowSize = (data[0] && data[0].length) ? data[0].length : 0;
      const numChannels = (data[0] && data[0][0] && data[0][0].length) ? data[0][0].length : 0;
      shape = [numWindows, windowSize, numChannels];
    }

    const [numWindows, windowSize, numChannels] = shape;
    if (numWindows === 0 || windowSize === 0 || numChannels === 0) {
      return { output: [] };
    }

    // Veriyi 2B düzleştir: [numWindows * windowSize, numChannels]
    const flatPoints = [];
    for (let w = 0; w < numWindows; w++) {
      for (let t = 0; t < windowSize; t++) {
        const val = data[w] && data[w][t] ? data[w][t] : new Array(numChannels).fill(0);
        flatPoints.push(val);
      }
    }

    // KMeansClusteringNode yardımıyla düzleştirilmiş noktaları kümele
    const kmeans = new KMeansClusteringNode(this.id + '_internal', 'Internal KMeans', { k, maxIterations });
    const { output: flatLabels } = kmeans.execute({ embeddings: flatPoints });

    // Küme etiketlerini tekrar [numWindows, windowSize] boyutunda 2B diziye şekillendir
    const pointWiseLabels = [];
    let idx = 0;
    for (let w = 0; w < numWindows; w++) {
      const windowLabels = [];
      for (let t = 0; t < windowSize; t++) {
        windowLabels.push(flatLabels[idx++]);
      }
      pointWiseLabels.push(windowLabels);
    }

    return { output: pointWiseLabels };
  }
}


/**
 * Pencere bazlı tahmin edilen Sınıf/Küme ID'lerini, kayma adımı (stride) parametresini kullanarak
 * orijinal kesintisiz 1D sinyal boyutuna geri haritalar.
 * Çakışan bölgeler için 'Çoğunluk Oylaması' (Majority Voting) algoritmasını uygular.
 */
class SignalMaskReconstructorNode extends BaseNode {
  execute(inputs) {
    const { clusterIds } = inputs;
    const { originalLength, windowSize, stride, threshold = 0.5 } = this.params;

    if (clusterIds === undefined) {
      throw new Error(`SignalMaskReconstructorNode [${this.id}] girdi olarak 'clusterIds' almalıdır.`);
    }
    if (originalLength === undefined || windowSize === undefined || stride === undefined) {
      throw new Error(`SignalMaskReconstructorNode [${this.id}] 'originalLength', 'windowSize' ve 'stride' parametrelerini almalıdır.`);
    }

    // Tensör ise JS dizisine çevir (squeeze ve threshold desteği)
    let ids = clusterIds;
    if (tf && ids instanceof tf.Tensor) {
      const tensorToSync = ids;
      ids = tf.tidy(() => {
        let t = tensorToSync;
        if (t.shape.length === 3 && t.shape[2] === 1) {
          t = t.squeeze([2]);
        }
        if (t.dtype === 'float32') {
          const th = parseFloat(threshold) || 0.5;
          t = tf.greater(t, th).toInt();
        }
        return t.arraySync();
      });
    } else if (ids && ids.arraySync) {
      ids = ids.arraySync();
    }

    const numWindows = ids.length;

    // Her bir orijinal sinyal indeksi için alınan oyları sayacak tablo oluştur
    // votes[indeks] = { labelValue: oyMiktarı }
    const votes = Array.from({ length: originalLength }, () => ({}));

    for (let w = 0; w < numWindows; w++) {
      const startIdx = w * stride;
      const windowData = ids[w];
      
      // Eğer pencere verisi bir diziyse (noktasal segmentasyon tahminleri),
      // değilse tekil bir sayıdır (pencere bazlı kümeleme etiketi)
      const isPointWise = Array.isArray(windowData);

      for (let t = 0; t < windowSize; t++) {
        const globalIdx = startIdx + t;
        if (globalIdx >= originalLength) break; // Orijinal sinyal boyutu aşılırsa kes

        const label = isPointWise ? windowData[t] : windowData;
        if (label === undefined || label === null) continue;

        votes[globalIdx][label] = (votes[globalIdx][label] || 0) + 1;
      }
    }

    // Her örnek için en çok oy alan sınıfı seç (Çoğunluk Oylaması)
    const reconstructedMask = new Int32Array(originalLength);
    for (let i = 0; i < originalLength; i++) {
      const labelVotes = votes[i];
      let maxVotes = -1;
      let winningLabel = 0; // Varsayılan arka plan etiketi

      for (const [labelStr, count] of Object.entries(labelVotes)) {
        if (count > maxVotes) {
          maxVotes = count;
          winningLabel = Number(labelStr);
        }
      }
      reconstructedMask[i] = winningLabel;
    }

    return { output: reconstructedMask };
  }
}

/**
 * Tam Bağlantılı (Dense / Fully Connected) Katman Düğümü.
 * Özellik çıkarımının sonunda projeksiyon veya sınıflandırma yapar.
 */
class DenseNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`DenseNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    const {
      units,
      activation = 'relu',
      useBias = true
    } = this.params;

    if (units === undefined) {
      throw new Error(`DenseNode [${this.id}] 'units' parametresini içermelidir.`);
    }

    this.layer = tf.layers.dense({
      units: parseInt(units) || 8,
      activation,
      useBias,
      name: this.id
    });

    const outputTensor = this.layer.apply(inputTensor);
    return { output: outputTensor };
  }
}

/**
 * Boyut Düzleştirme (Flatten) Katman Düğümü.
 * Çok boyutlu evrişimsel özellikleri tek boyutlu vektöre dönüştürerek Dense katmanına hazırlar.
 */
class FlattenNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`FlattenNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    this.layer = tf.layers.flatten({
      name: this.id
    });

    const outputTensor = this.layer.apply(inputTensor);
    return { output: outputTensor };
  }
}

/**
 * Seyreltme (Dropout) Katman Düğümü.
 * Eğitim sırasında aşırı öğrenmeyi (overfitting) önlemek amacıyla belirtilen oranda nöronu rastgele kapatır.
 */
class DropoutNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`DropoutNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    const { rate = 0.2 } = this.params;

    this.layer = tf.layers.dropout({
      rate: parseFloat(rate) || 0.2,
      name: this.id
    });

    const outputTensor = this.layer.apply(inputTensor);
    return { output: outputTensor };
  }
}

/**
 * Yığın Normalizasyonu (Batch Normalization) Katman Düğümü.
 * Aktivasyonları normalize ederek model eğitimini hızlandırır ve stabilize eder.
 */
class BatchNormalizationNode extends BaseNode {
  execute(inputs) {
    const inputTensor = inputs.input;
    if (!inputTensor) {
      throw new Error(`BatchNormalizationNode [${this.id}] için bir 'input' symbolic tensor gereklidir.`);
    }

    const { axis = -1 } = this.params;

    this.layer = tf.layers.batchNormalization({
      axis: parseInt(axis) || -1,
      name: this.id
    });

    const outputTensor = this.layer.apply(inputTensor);
    return { output: outputTensor };
  }
}

// ==========================================
// EXPORTS & BROWSER REGISTRATION
// ==========================================

const AtomicNodes = {
  BaseNode,
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
  DenseKMeansClusteringNode,
  SignalMaskReconstructorNode,
  DenseNode,
  FlattenNode,
  DropoutNode,
  BatchNormalizationNode
};

// Klasik script etiketleri ve küresel ortam desteği (Node/Browser)
if (typeof globalThis !== 'undefined') {
  globalThis.AtomicNodes = AtomicNodes;
}
if (typeof window !== 'undefined') {
  window.AtomicNodes = AtomicNodes;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AtomicNodes;
}

