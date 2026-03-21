// Core: Signal Operations

function invertSignal() {
    if (!state.signal || state.signal.length === 0) return alert("Load a file first!");
    if (window.showLoading) window.showLoading("Inverting Signal...");

    setTimeout(() => {
        const signal = state.signal;
        for (let i = 0; i < signal.length; i++) {
            signal[i] = -signal[i];
        }
        let tempMin = state.globalMin;
        state.globalMin = -state.globalMax;
        state.globalMax = -tempMin;

        if (state.isBaselineEnabled) {
            let b = window.roundToPrecision ? window.roundToPrecision(-state.baselineValue) : -state.baselineValue;
            state.baselineValue = b;
            if (elements.baselineInput) elements.baselineInput.value = b;
        }

        if (window.recalcFilters) window.recalcFilters();
        if (window.draw) window.draw();
        if (window.hideLoading) window.hideLoading();
    }, 10);
}

function updatePrecision() {
    let val = parseInt(elements.precisionInput.value) || 5;
    state.dataPrecision = val;

    if (state.signal && state.signal.length > 0) {
        if (window.recalcFilters) window.recalcFilters();
        if (state.isBaselineEnabled) {
            state.baselineValue = window.roundToPrecision(state.baselineValue);
            if (elements.baselineInput) elements.baselineInput.value = state.baselineValue;
        }
        if (window.draw) window.draw(false);
    }
}


function alignBaselineToZero() {
    if (!state.signal) return;
    let offset = state.baselineValue;
    if (offset === 0) return;

    if (window.showLoading) window.showLoading("Adjusting Baseline...");
    setTimeout(() => {
        const signal = state.signal;
        for (let i = 0; i < signal.length; i++) {
            signal[i] = signal[i] - offset;
        }
        state.globalMin = state.globalMin - offset;
        state.globalMax = state.globalMax - offset;
        state.baselineValue = 0;

        if (elements.baselineInput) elements.baselineInput.value = 0;

        if (!state.isBaselineEnabled) {
            state.isBaselineEnabled = true;
            if (elements.baselineToggle) elements.baselineToggle.checked = true;
            if (elements.baselineInput) elements.baselineInput.disabled = false;
        }

        if (window.recalcFilters) window.recalcFilters();
        if (window.draw) window.draw();
        if (window.hideLoading) window.hideLoading();
    }, 50);
}

/**
 * Ana sinyali referans sinyalle değiştirir.
 * Etiketler (labels) korunur, sadece sinyal verisi değişir.
 *
 * @param {number} refIndex - Değiştirilecek referans sinyalin indeksi
 */
function swapSignalWithReference(refIndex) {
    if (!state.signal) return alert("No main signal loaded!");
    if (!state.referenceSignals || refIndex >= state.referenceSignals.length) {
        return alert("Invalid reference index!");
    }

    const ref = state.referenceSignals[refIndex];
    if (!ref || !ref.data || ref.data.length === 0) {
        return alert("Reference signal has no data!");
    }

    if (window.showLoading) window.showLoading("Swapping Signal...");

    setTimeout(() => {
        // 1. Mevcut ana sinyali referans olarak kaydet
        const oldSignal = state.signal;
        const oldName = document.getElementById("file-status")?.textContent?.replace("File: ", "") || "Previous Main";

        state.referenceSignals.push({
            name: oldName,
            data: new Float32Array(oldSignal),
            color: getRandomColor()
        });

        // 2. Referans sinyali ana sinyal yap
        const newSignal = new Float32Array(ref.data);

        // 3. Boyut kontrolü — labels'ı yeni sinyal boyutuna uyarla
        let labels = state.labels;
        if (newSignal.length !== labels.length) {
            const newLabels = new Int8Array(newSignal.length);
            // Mevcut etiketleri kopyala (kısa olanın boyutu kadar)
            const copyLen = Math.min(labels.length, newSignal.length);
            for (let i = 0; i < copyLen; i++) {
                newLabels[i] = labels[i];
            }
            labels = newLabels;
        }

        // 4. Min/Max hesapla
        let globalMin = Infinity, globalMax = -Infinity;
        for (let i = 0; i < newSignal.length; i++) {
            if (newSignal[i] < globalMin) globalMin = newSignal[i];
            if (newSignal[i] > globalMax) globalMax = newSignal[i];
        }

        // 5. Türev hesapla
        const rawDeriv = new Float32Array(newSignal.length);
        const factor = Math.pow(10, state.dataPrecision);
        for (let i = 1; i < newSignal.length - 1; i++) {
            rawDeriv[i] = Math.round(((newSignal[i + 1] - newSignal[i - 1]) / 2) * factor) / factor;
        }

        // 6. Kullanılan referansı listeden çıkar
        state.referenceSignals.splice(refIndex, 1);

        // 7. State güncelle (labels korunuyor!)
        updateState({
            signal: newSignal,
            labels: labels,
            globalMin: globalMin,
            globalMax: globalMax,
            rawDerivativeSignal: rawDeriv,
            smoothedSignal: null,
            smoothDerivativeSignal: null
        });

        // 8. Smooth aktifse yeniden hesapla
        if (state.isSmoothEnabled) {
            if (window.recalcFilters) window.recalcFilters();
        }

        // 9. UI güncelle
        if (document.getElementById("file-status")) {
            document.getElementById("file-status").textContent = `File: ${ref.name} (${newSignal.length.toLocaleString()} pts)`;
        }

        updateSliderMax();
        if (window.draw) window.draw(true);
        if (window.hideLoading) window.hideLoading();

        console.log(`Signal swapped with reference "${ref.name}" — labels preserved`);
    }, 50);
}

/**
 * Sinyal değiştirme dialogunu gösterir.
 */
function openSignalSwapDialog() {
    if (!state.signal) return alert("No main signal loaded!");
    if (!state.referenceSignals || state.referenceSignals.length === 0) {
        return alert("Referans sinyal yok! Önce 'Add Ref' ile bir referans ekleyin.");
    }

    const container = document.getElementById('signalSwapList');
    if (!container) return;

    container.innerHTML = '';

    state.referenceSignals.forEach((ref, idx) => {
        const btn = document.createElement('button');
        btn.className = 'modal-btn';
        btn.style.textAlign = 'left';
        btn.innerHTML = `<strong>${ref.name}</strong> — ${ref.data.length.toLocaleString()} pts`;
        btn.onclick = () => {
            closeModal('signalSwapModal');
            swapSignalWithReference(idx);
        };
        container.appendChild(btn);
    });

    openModal('signalSwapModal');
}

// Expose globals
window.invertSignal = invertSignal;
window.updatePrecision = updatePrecision;
window.alignBaselineToZero = alignBaselineToZero;
window.swapSignalWithReference = swapSignalWithReference;
window.openSignalSwapDialog = openSignalSwapDialog;

