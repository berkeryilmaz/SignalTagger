// Core: Class Manager
// Manages state.labelTypes and provides methods to manipulate them.

function ensureClass(id) {
    id = parseInt(id);
    if (!state.labelTypes[id]) {
        // Create new class with random color if it doesn't exist
        state.labelTypes[id] = {
            name: `Class ${id}`,
            color: getRandomColor()
        };
        console.log(`Auto-registered Class ${id}`);
        // Notify UI if needed, usually renderClassButtons needed after this
        if (window.renderClassButtons) window.renderClassButtons();
    }
}

function registerClass(id, name, color) {
    id = parseInt(id);
    state.labelTypes[id] = {
        name: name || `Class ${id}`,
        color: color || getRandomColor()
    };
    if (window.renderClassButtons) window.renderClassButtons();
}

function deleteClass(id) {
    id = parseInt(id);
    if (state.labelTypes[id]) {
        delete state.labelTypes[id];
        // Also clean up labels in the signal? 
        // For now, let's leave them as numbers, they just won't have a lookup. 
        // Or we could remap them to 0.
        if (state.labels) {
            for (let i = 0; i < state.labels.length; i++) {
                if (state.labels[i] === id) state.labels[i] = 0;
            }
        }
        if (state.currentLabelType === id) state.currentLabelType = 0;
        if (window.renderClassButtons) window.renderClassButtons();
        if (window.draw) window.draw(true);
    }
}

function exportMetadata() {
    // Returns JSON string of labelTypes
    return JSON.stringify(state.labelTypes);
}

function importMetadata(jsonStr) {
    try {
        const metadata = JSON.parse(jsonStr);
        if (metadata && typeof metadata === 'object') {
            // Merge or overwrite? Let's overwrite specific IDs but keep others if compatible? 
            // Usually we want to load what's in the file.
            // Let's merge: if ID exists in file, overwrite state. 
            for (const key in metadata) {
                const id = parseInt(key);
                state.labelTypes[id] = metadata[key];
            }
            if (window.renderClassButtons) window.renderClassButtons();
            console.log("Metadata imported successfully.");
        }
    } catch (e) {
        console.warn("Failed to import metadata:", e);
    }
}

function getNextAvailableClassId() {
    const ids = Object.keys(state.labelTypes).map(k => parseInt(k));
    const maxId = Math.max(...ids, 0);
    return maxId + 1;
}

function convertLabels(fromId, toId) {
    fromId = parseInt(fromId);
    toId = parseInt(toId);

    if (fromId === toId) return 0;
    if (!state.labels) return 0;

    let count = 0;
    for (let i = 0; i < state.labels.length; i++) {
        if (state.labels[i] === fromId) {
            state.labels[i] = toId;
            count++;
        }
    }

    if (count > 0) {
        console.log(`Converted ${count} points from Class ${fromId} to Class ${toId}`);
        if (window.draw) window.draw(true);
        // If we converted TO the eraser (0), we might want to ensure 0 is handled correctly visually
        // but draw(true) should handle it.

        // Update analysis if needed
        if (window.updatePeakAnalysis) window.updatePeakAnalysis();
    }
    return count;
}

// Expose globals
window.ensureClass = ensureClass;
window.registerClass = registerClass;
window.deleteClass = deleteClass;
window.exportMetadata = exportMetadata;
window.importMetadata = importMetadata;
window.getNextAvailableClassId = getNextAvailableClassId;
window.convertLabels = convertLabels;
