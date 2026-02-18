/**
 * Handles .bin file parsing for Oscilloscope data
 * Ports logic from:
 * - Oscilloscope/FileReader.py
 * - Oscilloscope/Oscilloscope.py
 * - Oscilloscope/Channel.py
 */

class BinLoader {
    constructor() {
        this.textDecoder = new TextDecoder('utf-8');
    }

    async parseFiles(files) {
        // Sort files by name
        const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));

        let allSetups = [];

        for (const file of sortedFiles) {
            try {
                const buffer = await file.arrayBuffer();
                const setup = this.parseSingleFile(buffer, file.name);
                allSetups.push(setup);
            } catch (e) {
                console.error(`Error parsing ${file.name}:`, e);
                alert(`Error parsing ${file.name}: ${e.message}`);
                return null;
            }
        }

        if (allSetups.length === 0) return null;

        return this.mergeSetups(allSetups);
    }

    parseSingleFile(buffer, fileName) {
        const uint8 = new Uint8Array(buffer);

        // 1. Optimized JSON Extraction
        // Only decode the beginning of the file (e.g., 50KB) to find the JSON header
        // This avoids converting the entire binary file to a string, which is slow.
        const headerLimit = Math.min(uint8.length, 50000);
        const headerSubarray = uint8.subarray(0, headerLimit);

        // Use TextDecoder for fast decoding (much faster than loop with String.fromCharCode)
        // 'iso-8859-1' preserves byte values 0-255 in string form 1:1, useful for binary-safe parsing if needed
        // But for JSON (utf-8 compatible usually), utf-8 or similar is fine. 
        // Python used 'unicode_escape' which is tricky, but the data seems to be headers separated by nulls.
        // Let's use a safe decoder.
        let fileStr = "";
        try {
            fileStr = new TextDecoder('utf-8', { fatal: false }).decode(headerSubarray);
        } catch (e) {
            // Fallback to manual if needed, but TextDecoder is robust with fatal:false
            for (let i = 0; i < headerLimit; i++) {
                fileStr += String.fromCharCode(headerSubarray[i]);
            }
        }

        // Try to find the largest outer JSON object
        const startIndex = fileStr.indexOf('{');
        // We only look for the *last* '}' within our header limit.
        const endIndex = fileStr.lastIndexOf('}');

        let setup = null;

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const jsonStr = fileStr.substring(startIndex, endIndex + 1);
            try {
                const rawParsed = JSON.parse(jsonStr);
                const normalized = this.normalizeKeys(rawParsed);
                if (normalized.sample && normalized.channel) {
                    setup = normalized;
                }
            } catch (e) {
                // If simple parse fails, it might be due to trailing garbage or multiple JSONs
                // Try to find valid JSON by shrinking the range or splitting by nulls *within the header*
            }
        }

        // Fallback: Try splitting by nulls ONLY in the header string
        if (!setup) {
            const parts = fileStr.split('\x00');
            for (const part of parts) {
                const s = part.indexOf('{');
                const e = part.lastIndexOf('}');
                if (s !== -1 && e !== -1 && e > s) {
                    try {
                        const raw = JSON.parse(part.substring(s, e + 1));
                        const norm = this.normalizeKeys(raw);
                        if (norm.sample && norm.channel) {
                            setup = norm;
                            break;
                        }
                    } catch (err) { }
                }
            }
        }

        if (!setup) {
            throw new Error(`Could not find valid JSON config in header (first 50KB).`);
        }

        // 2. Determine Data Splitter
        const dataLen = setup.sample.datalen;
        let splitBytes = [0xF0, 0x05, 0x00, 0x00];
        if (dataLen === 1520) {
            splitBytes = [0xE0, 0x0B, 0x00, 0x00];
        }

        // 3. Find Split Points in the entire file using Byte Search (FAST)
        const indices = this.findSequenceIndices(uint8, splitBytes);

        // Match channels to data blocks
        // Indices point to the START of the separator.
        // Data starts 4 bytes AFTER the separator.
        // Block i corresponds to channel i.

        const channels = setup.channel || [];

        channels.forEach((channel, i) => {
            if (i < indices.length) {
                const start = indices[i] + 4; // Skip delimiter
                // We need datalen int16s -> datalen * 2 bytes
                const neededBytes = dataLen * 2;

                // Check if we have enough bytes
                if (start + neededBytes > uint8.length) {
                    console.warn(`Unexpected end of file for channel ${i}`);
                }

                // Create a view on the existing buffer (no copy if possible, or slice)
                // Slice is safer to avoid retaining the huge buffer if not needed, 
                // but here binLoader is transient. 
                // However, creating a float32 array copies anyway.

                const chunkBuffer = buffer.slice(start, start + neededBytes);
                const int16View = new Int16Array(chunkBuffer);
                channel.raw_data = new Float32Array(int16View);

                channel.data = this.convertToVoltage(channel.raw_data, channel);
                channel.successful_read = true;
            } else {
                channel.raw_data = new Float32Array(dataLen).fill(0);
                channel.data = new Float32Array(dataLen).fill(0);
                channel.successful_read = false;
            }
        });

        return setup;
    }

    findSequenceIndices(uint8, sequence) {
        const indices = [];
        const seqLen = sequence.length;
        const totalLen = uint8.length;

        for (let i = 0; i < totalLen - seqLen + 1; i++) {
            if (uint8[i] === sequence[0]) { // Quick check first byte
                let match = true;
                for (let j = 1; j < seqLen; j++) {
                    if (uint8[i + j] !== sequence[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    indices.push(i);
                    // Python split consumes the delimiter, so effectively we skip past it?
                    // But here we just want to find where they start.
                    // We can jump forward to avoid overlapping (though unlikely for this delimiter)
                    i += seqLen - 1;
                }
            }
        }
        return indices;
    }

    convertToVoltage(rawData, channel) {
        // Python:
        // voltage_scale = Helper.parseVoltage(self.scale)
        // probe_multipler = Helper.parseProbeMultipler(self.probe)
        // num = (5 * value / 2000 - self.offset * 2 / 100) * voltage_scale * probe_multipler

        const voltageScale = this.parseVoltage(channel.scale);
        const probeMultiplier = this.parseProbeMultiplier(channel.probe);
        const offset = parseFloat(channel.offset) || 0;

        const floatData = new Float32Array(rawData.length);

        // Pre-calculate constants
        const factor = (5 / 2000);
        const offsetStr = (offset * 2 / 100);
        const totalMult = voltageScale * probeMultiplier;

        for (let i = 0; i < rawData.length; i++) {
            const value = rawData[i];
            const num = (value * factor - offsetStr) * totalMult;
            floatData[i] = num;  // JS keeps plenty of precision
        }
        return floatData;
    }

    parseVoltage(scaleStr) {
        // Python Helper.parseVoltage
        if (!scaleStr) return 1;
        let s = scaleStr.toString().toLowerCase();
        if (s.includes("mv")) {
            return parseFloat(s.replace("mv", "")) / 1000.0;
        } else if (s.includes("v")) {
            return parseFloat(s.replace("v", ""));
        }
        return parseFloat(s);
    }

    parseProbeMultiplier(probeStr) {
        // Python Helper.parseProbeMultipler
        if (!probeStr) return 1;
        let s = probeStr.toString().toLowerCase().replace("x", "");
        if (s.trim() === "") return 1;
        return parseFloat(s);
    }

    mergeSetups(setups) {
        if (setups.length === 0) return null;
        if (setups.length === 1) return setups[0];

        // 1. Calculate Total Length
        let totalDataLen = 0;
        for (const s of setups) {
            totalDataLen += s.sample.datalen;
        }

        // 2. Prepare Merged Setup Base
        const merged = JSON.parse(JSON.stringify(setups[0])); // Deep copy base
        merged.sample.datalen = totalDataLen; // Update total length

        // 3. Allocate Buffers for Channels
        const numChannels = merged.channel.length;

        // We assume all setups have the same channels in same order (usually true for same device capture)
        for (let chIdx = 0; chIdx < numChannels; chIdx++) {
            const ch = merged.channel[chIdx];
            ch.data = new Float32Array(totalDataLen);
            ch.raw_data = new Float32Array(totalDataLen);
        }

        // 4. Fill Buffers (Linear Copy)
        let offset = 0;
        for (const s of setups) {
            const len = s.sample.datalen;

            for (let chIdx = 0; chIdx < numChannels; chIdx++) {
                const targetCh = merged.channel[chIdx];
                const sourceCh = s.channel[chIdx];

                if (sourceCh && sourceCh.data && sourceCh.raw_data) {
                    targetCh.data.set(sourceCh.data, offset);
                    targetCh.raw_data.set(sourceCh.raw_data, offset);
                }
            }

            offset += len;
        }

        return merged;
    }

    normalizeKeys(obj) {
        if (Array.isArray(obj)) {
            return obj.map(v => this.normalizeKeys(v));
        } else if (obj !== null && obj.constructor === Object) {
            return Object.keys(obj).reduce((result, key) => {
                const lowerKey = key.toLowerCase();
                result[lowerKey] = this.normalizeKeys(obj[key]);
                return result;
            }, {});
        }
        return obj;
    }
}

// Export instance
window.binLoader = new BinLoader();
