/**
 * Node-Based Analysis Pipeline Editor
 * =====================================
 * This module provides a visual DAG (Directed Acyclic Graph) editor
 * for building signal analysis pipelines.
 */

// --- 1. NODE REGISTRY & DEFINITIONS ---
const NODE_CATEGORIES = ['Input', 'Math', 'Logic', 'Signal Ops', 'Statistics', 'Analysis', 'Physics', 'Output'];

// --- POLYMORPHIC MATH HELPERS ---
// These allow math nodes to operate on numbers, signals (Float32Array), or arrays.
// If both inputs are signals/arrays → element-wise operation (shorter length used).
// If one is signal/array and other is number → broadcast the number.
// If both are numbers → plain scalar operation.

function _isSignalOrArray(v) {
    return v instanceof Float32Array || v instanceof Int8Array || v instanceof Uint8Array || Array.isArray(v);
}

function _toFloat32(v) {
    if (v instanceof Float32Array) return v;
    if (Array.isArray(v)) return new Float32Array(v);
    if (v instanceof Int8Array || v instanceof Uint8Array) {
        let out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = v[i];
        return out;
    }
    return v;
}

/**
 * Applies a binary math operation polymorphically.
 * Returns { out: number|Float32Array }
 */
function _mathBinary(a, b, fn) {
    const aIsArr = _isSignalOrArray(a);
    const bIsArr = _isSignalOrArray(b);

    if (aIsArr && bIsArr) {
        // Element-wise
        a = _toFloat32(a); b = _toFloat32(b);
        const len = Math.min(a.length, b.length);
        const out = new Float32Array(len);
        for (let i = 0; i < len; i++) out[i] = fn(a[i], b[i]);
        return { out };
    } else if (aIsArr) {
        // Broadcast b (number) over a (array)
        a = _toFloat32(a);
        const bVal = Number(b) || 0;
        const out = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = fn(a[i], bVal);
        return { out };
    } else if (bIsArr) {
        // Broadcast a (number) over b (array)
        b = _toFloat32(b);
        const aVal = Number(a) || 0;
        const out = new Float32Array(b.length);
        for (let i = 0; i < b.length; i++) out[i] = fn(aVal, b[i]);
        return { out };
    } else {
        // Both scalars
        return { out: fn(Number(a) || 0, Number(b) || 0) };
    }
}

/**
 * Applies a unary math operation polymorphically.
 * Returns { out: number|Float32Array }
 */
function _mathUnary(a, fn) {
    if (_isSignalOrArray(a)) {
        a = _toFloat32(a);
        const out = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = fn(a[i]);
        return { out };
    } else {
        return { out: fn(Number(a) || 0) };
    }
}

const NODE_TYPES = {
    // --- INPUT ---
    'SignalSource': {
        category: 'Input', name: 'Signal Source', outputs: [{ name: 'signal', type: 'signal' }],
        exec: () => { if (!state.signal) throw new Error("No signal loaded"); return { signal: state.signal }; }
    },
    'WindowSource': {
        category: 'Input', name: 'Window Source (Pencere)', outputs: [{ name: 'signal', type: 'signal' }],
        exec: () => {
            if (!state.signal) throw new Error("No signal loaded");
            let start = state.windowStart || 0;
            let end = Math.min(state.signal.length, start + (state.windowSize || state.signal.length));
            return { signal: state.signal.slice(start, end) };
        }
    },
    'NumberConstant': {
        category: 'Input', name: 'Number Constant', params: [{ name: 'value', type: 'number', default: 1 }],
        outputs: [{ name: 'val', type: 'number' }],
        exec: (inputs, params) => ({ val: parseFloat(params.value) })
    },
    'BooleanConstant': {
        category: 'Input', name: 'Boolean Constant', params: [{ name: 'value', type: 'boolean', default: true }],
        outputs: [{ name: 'val', type: 'boolean' }],
        exec: (inputs, params) => ({ val: params.value === 'true' || params.value === true })
    },
    'ArrayConstant': {
        category: 'Input', name: 'Array Constant', params: [{ name: 'csv', type: 'string', default: '1,2,3' }],
        outputs: [{ name: 'arr', type: 'array' }],
        exec: (inputs, params) => ({ arr: params.csv.split(',').map(Number) })
    },
    'StringConstant': {
        category: 'Input', name: 'String Constant', params: [{ name: 'value', type: 'string', default: 'signal' }],
        outputs: [{ name: 'str', type: 'string' }],
        exec: (inputs, params) => ({ str: params.value })
    },
    'RefSource': {
        category: 'Input', name: 'Reference Signal',
        params: [{ name: 'index', type: 'number', default: 0 }],
        outputs: [{ name: 'signal', type: 'signal' }, { name: 'name', type: 'string' }, { name: 'count', type: 'number' }],
        exec: (inputs, params) => {
            let refs = state.referenceSignals;
            let count = refs ? refs.length : 0;
            let idx = parseInt(params.index) || 0;
            if (!refs || idx < 0 || idx >= count) return { signal: null, name: '', count: count };
            let ref = refs[idx];
            return { signal: new Float32Array(ref.data), name: ref.name, count: count };
        }
    },
    'RangeGenerator': {
        category: 'Input', name: 'Range Generator',
        params: [{ name: 'start', type: 'number', default: 0 }, { name: 'end', type: 'number', default: 10 }, { name: 'step', type: 'number', default: 1 }],
        outputs: [{ name: 'arr', type: 'array' }, { name: 'length', type: 'number' }],
        exec: (inputs, params) => {
            let s = parseFloat(params.start) || 0;
            let e = parseFloat(params.end) || 10;
            let step = parseFloat(params.step) || 1;
            if (step === 0) step = 1;
            if ((e - s) / step > 1e6) throw new Error("Range too large (>1M elements)");
            let arr = [];
            if (step > 0) { for (let v = s; v < e; v += step) arr.push(v); }
            else { for (let v = s; v > e; v += step) arr.push(v); }
            return { arr: new Float32Array(arr), length: arr.length };
        }
    },
    // --- MATH (Polymorphic: works on both numbers and signals) ---
    'Add': { category: 'Math', name: 'Add', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a + b) },
    'Subtract': { category: 'Math', name: 'Subtract', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a - b) },
    'Multiply': { category: 'Math', name: 'Multiply', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a * b) },
    'Divide': { category: 'Math', name: 'Divide', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => b === 0 ? 0 : a / b) },
    'Power': { category: 'Math', name: 'Power', inputs: [{ name: 'base', type: 'any' }, { name: 'exp', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.base, inputs.exp !== undefined ? inputs.exp : 1, (a, b) => Math.pow(a, b)) },
    'Sqrt': { category: 'Math', name: 'Square Root', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.sqrt(Math.max(0, a))) },
    'Abs': { category: 'Math', name: 'Absolute', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.abs(a)) },
    'Negate': { category: 'Math', name: 'Negate', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => -a) },
    'Log': { category: 'Math', name: 'Logarithm (ln)', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.log(Math.max(1e-10, a))) },
    'Exp': { category: 'Math', name: 'Exponential', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.exp(a)) },
    'Min': { category: 'Math', name: 'Min', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => Math.min(a, b)) },
    'Max': { category: 'Math', name: 'Max', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => Math.max(a, b)) },
    'Clamp': { category: 'Math', name: 'Clamp', inputs: [{ name: 'val', type: 'any' }], params: [{ name: 'min', type: 'number', default: 0 }, { name: 'max', type: 'number', default: 1 }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs, params) => _mathUnary(inputs.val, v => Math.min(Math.max(v, parseFloat(params.min)), parseFloat(params.max))) },
    'Round': { category: 'Math', name: 'Round', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.round(a)) },
    'Floor': { category: 'Math', name: 'Floor', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.floor(a)) },
    'Ceil': { category: 'Math', name: 'Ceil', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.ceil(a)) },
    'Sin': { category: 'Math', name: 'Sin', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.sin(a)) },
    'Cos': { category: 'Math', name: 'Cos', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.cos(a)) },
    'Tan': { category: 'Math', name: 'Tan', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.tan(a)) },
    'Asin': { category: 'Math', name: 'Arcsin', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.asin(a)) },
    'Acos': { category: 'Math', name: 'Arccos', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.acos(a)) },
    'Atan': { category: 'Math', name: 'Arctan', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => Math.atan(a)) },
    'Atan2': { category: 'Math', name: 'Atan2 (y,x)', inputs: [{ name: 'y', type: 'any' }, { name: 'x', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.y, inputs.x, (y, x) => Math.atan2(y, x)) },

    // --- LOGIC / COMPARISON (Polymorphic: works on both numbers and signals) ---
    // Comparison nodes return 1 (true) or 0 (false). For signals, element-wise comparison.
    'LessThan': { category: 'Logic', name: 'Less Than (<)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a < b ? 1 : 0) },
    'GreaterThan': { category: 'Logic', name: 'Greater Than (>)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a > b ? 1 : 0) },
    'LessEqual': { category: 'Logic', name: 'Less or Equal (≤)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a <= b ? 1 : 0) },
    'GreaterEqual': { category: 'Logic', name: 'Greater or Equal (≥)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => a >= b ? 1 : 0) },
    'Equal': { category: 'Logic', name: 'Equal (==)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => Math.abs(a - b) < 1e-10 ? 1 : 0) },
    'NotEqual': { category: 'Logic', name: 'Not Equal (≠)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => Math.abs(a - b) >= 1e-10 ? 1 : 0) },

    // Boolean logic: treats any non-zero value as true (1), zero as false (0)
    'And': { category: 'Logic', name: 'AND (&&)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => (a !== 0 && b !== 0) ? 1 : 0) },
    'Or': { category: 'Logic', name: 'OR (||)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => (a !== 0 || b !== 0) ? 1 : 0) },
    'Not': { category: 'Logic', name: 'NOT (!)', inputs: [{ name: 'a', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathUnary(inputs.a, a => a === 0 ? 1 : 0) },
    'Xor': { category: 'Logic', name: 'XOR (⊕)', inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], exec: (inputs) => _mathBinary(inputs.a, inputs.b, (a, b) => ((a !== 0) !== (b !== 0)) ? 1 : 0) },

    // Ternary / Select — the core conditional: out = condition ? trueVal : falseVal
    // Connect a comparison output to 'cond'. For signals, element-wise selection.
    'Ternary': {
        category: 'Logic', name: 'Select (If/Then/Else)',
        inputs: [{ name: 'cond', type: 'any' }, { name: 'trueVal', type: 'any' }, { name: 'falseVal', type: 'any' }],
        outputs: [{ name: 'out', type: 'any' }],
        exec: (inputs) => {
            const cond = inputs.cond;
            const tv = inputs.trueVal;
            const fv = inputs.falseVal;

            const condArr = _isSignalOrArray(cond);
            const tvArr = _isSignalOrArray(tv);
            const fvArr = _isSignalOrArray(fv);

            // Determine output length from the longest array input
            let len = 0;
            if (condArr) len = Math.max(len, cond.length);
            if (tvArr) len = Math.max(len, tv.length);
            if (fvArr) len = Math.max(len, fv.length);

            if (len > 0) {
                // At least one input is an array → element-wise
                const out = new Float32Array(len);
                for (let i = 0; i < len; i++) {
                    const c = condArr ? (cond[i] || 0) : (Number(cond) || 0);
                    const t = tvArr ? (tv[i] !== undefined ? tv[i] : 0) : (Number(tv) || 0);
                    const f = fvArr ? (fv[i] !== undefined ? fv[i] : 0) : (Number(fv) || 0);
                    out[i] = c !== 0 ? t : f;
                }
                return { out };
            } else {
                // All scalars
                return { out: (Number(cond) || 0) !== 0 ? (Number(tv) || 0) : (Number(fv) || 0) };
            }
        }
    },

    // ThresholdReplace — shortcut node: if signal value <op> threshold, replace with 'replacement'
    // Common use case: "değer < 3 ise 0 yap"
    'ThresholdReplace': {
        category: 'Logic', name: 'Threshold Replace',
        inputs: [{ name: 'sig', type: 'any' }, { name: 'threshold', type: 'any' }, { name: 'replacement', type: 'any' }],
        params: [
            { name: 'operator', type: 'string', default: '<', options: ['<', '>', '<=', '>=', '==', '!='] },
            { name: 'threshold', type: 'number', default: 0 },
            { name: 'replacement', type: 'number', default: 0 }
        ],
        outputs: [{ name: 'out', type: 'any' }],
        exec: (inputs, params) => {
            const op = params.operator || '<';

            const threshInput = inputs.threshold;
            const replInput = inputs.replacement;

            const threshArr = _isSignalOrArray(threshInput);
            const replArr = _isSignalOrArray(replInput);
            const sigArr = _isSignalOrArray(inputs.sig);

            const compareFn = {
                '<': (v, t) => v < t,
                '>': (v, t) => v > t,
                '<=': (v, t) => v <= t,
                '>=': (v, t) => v >= t,
                '==': (v, t) => Math.abs(v - t) < 1e-10,
                '!=': (v, t) => Math.abs(v - t) >= 1e-10
            }[op] || ((v, t) => v < t);

            let len = 0;
            if (sigArr) len = Math.max(len, inputs.sig.length);
            if (threshArr) len = Math.max(len, threshInput.length);
            if (replArr) len = Math.max(len, replInput.length);

            const getThresh = (i) => threshArr ? (threshInput[i] !== undefined ? threshInput[i] : 0) : (threshInput !== undefined ? Number(threshInput) : parseFloat(params.threshold) || 0);
            const getRepl = (i) => replArr ? (replInput[i] !== undefined ? replInput[i] : 0) : (replInput !== undefined ? Number(replInput) : parseFloat(params.replacement) || 0);

            if (len > 0) {
                const out = new Float32Array(len);
                for (let i = 0; i < len; i++) {
                    const v = sigArr ? (inputs.sig[i] || 0) : (Number(inputs.sig) || 0);
                    const t = getThresh(i);
                    const r = getRepl(i);
                    out[i] = compareFn(v, t) ? r : v;
                }
                return { out };
            } else {
                const v = Number(inputs.sig) || 0;
                const t = getThresh(0);
                const r = getRepl(0);
                return { out: compareFn(v, t) ? r : v };
            }
        }
    },

    // InRange — checks if value is within [min, max], outputs 1 or 0 mask
    'InRange': {
        category: 'Logic', name: 'In Range',
        inputs: [{ name: 'a', type: 'any' }],
        params: [{ name: 'min', type: 'number', default: 0 }, { name: 'max', type: 'number', default: 1 }],
        outputs: [{ name: 'out', type: 'any' }],
        exec: (inputs, params) => {
            const lo = parseFloat(params.min) || 0;
            const hi = parseFloat(params.max) || 1;
            return _mathUnary(inputs.a, v => (v >= lo && v <= hi) ? 1 : 0);
        }
    },

    // --- SIGNAL OPS ---
    'SignalLoader': {
        category: 'Signal Ops', name: 'Signal Loader',
        inputs: [], outputs: [{ name: 'signal', type: 'signal' }],
        init: (node) => {
            let wrp = document.createElement('div');
            wrp.style.padding = '5px';

            let label = document.createElement('label');
            label.className = 'file-upload-label';
            label.textContent = 'Choose Files';
            label.style.width = '100%';
            label.style.cursor = 'pointer';

            let btn = document.createElement('input');
            btn.type = 'file';
            btn.multiple = true;
            btn.accept = '.csv,.txt,.bin';
            btn.style.display = 'none';

            let info = document.createElement('div');
            info.style.fontSize = '10px';
            info.style.color = '#888';
            info.style.marginTop = '4px';
            info.style.wordBreak = 'break-all';
            info.textContent = 'No file';
            info.style.textAlign = 'center';

            btn.onchange = async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                info.textContent = 'Loading...';
                const firstFile = files[0];

                if (firstFile.name.toLowerCase().endsWith('.bin')) {
                    if (!window.binLoader) return alert("binLoader not found!");
                    try {
                        const setup = await window.binLoader.parseFiles(files);
                        if (!setup) throw new Error("Parse error");
                        const activeChannels = (setup.channel || []).filter(ch => ch.display === 'ON' && ch.successful_read);
                        if (activeChannels.length === 0) throw new Error("No active channels");
                        let ch = activeChannels[0];
                        node.loadedSignal = ch.data;
                        info.textContent = `Loaded: ${firstFile.name} (${ch.data.length} pts)`;
                        if (window.nodeEditor) window.nodeEditor.evaluateGraph();
                    } catch (err) {
                        info.textContent = 'Error loading bin';
                        console.error(err);
                    }
                } else {
                    if (!window.Papa) return alert("PapaParse not found!");
                    Papa.parse(firstFile, {
                        header: true, dynamicTyping: true, skipEmptyLines: true, comments: "#",
                        complete: function (res) {
                            let data = new Float32Array(res.data.length);
                            res.data.forEach((row, i) => {
                                let keys = Object.keys(row);
                                let val = row.signal !== undefined ? row.signal : (row.voltage !== undefined ? row.voltage : row[keys[keys.length > 1 ? 1 : 0]]);
                                data[i] = typeof val === 'number' ? val : 0;
                            });
                            node.loadedSignal = data;
                            info.textContent = `Loaded: ${firstFile.name} (${data.length} pts)`;
                            if (window.nodeEditor) window.nodeEditor.evaluateGraph();
                        }
                    });
                }
            };
            label.appendChild(btn);
            wrp.appendChild(label);
            wrp.appendChild(info);
            node.el.appendChild(wrp);
        },
        exec: (inputs, params, node) => {
            return { signal: node.loadedSignal || null };
        }
    },
    'AlignBaseline': {
        category: 'Signal Ops', name: 'Align To Baseline', inputs: [{ name: 'sig', type: 'signal' }, { name: 'offset', type: 'number' }], outputs: [{ name: 'out', type: 'signal' }],
        exec: (inputs) => { let s = inputs.sig; let offset = inputs.offset || 0; if (!s) throw new Error("No signal input"); let out = new Float32Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s[i] - offset; return { out }; }
    },
    'ApplySGFilter': {
        category: 'Signal Ops', name: 'Savitzky-Golay Filter', inputs: [{ name: 'sig', type: 'signal' }], params: [{ name: 'window', type: 'number', default: 11 }, { name: 'order', type: 'number', default: 2 }], outputs: [{ name: 'out', type: 'signal' }],
        exec: (inputs, params) => { let s = inputs.sig; let w = parseInt(params.window); let o = parseInt(params.order); if (w % 2 === 0) w++; if (o >= w) o = w - 1; if (!s) throw new Error("No signal input"); return { out: window.applySavitzkyGolay(s, w, o) }; }
    },
    'SliceSignal': { category: 'Signal Ops', name: 'Slice Signal', inputs: [{ name: 'sig', type: 'signal' }, { name: 'start', type: 'number' }, { name: 'end', type: 'number' }], outputs: [{ name: 'out', type: 'signal' }], exec: (inputs) => { let s = inputs.sig; if (!s) throw new Error("No signal"); let start = Math.max(0, Math.floor(inputs.start || 0)); let end = typeof inputs.end === 'number' ? Math.floor(inputs.end) : s.length; end = Math.min(s.length, Math.max(start, end)); return { out: s.slice(start, end) }; } },
    'Derivative': { category: 'Signal Ops', name: 'Derivative (dx)', inputs: [{ name: 'sig', type: 'signal' }], outputs: [{ name: 'out', type: 'signal' }], exec: (inputs) => { let s = inputs.sig; if (!s) throw new Error("No signal"); let out = new Float32Array(s.length); out[0] = s[1] - s[0]; for (let i = 1; i < s.length - 1; i++) out[i] = (s[i + 1] - s[i - 1]) / 2; out[s.length - 1] = s[s.length - 1] - s[s.length - 2]; return { out }; } },
    'InvertSignal': { category: 'Signal Ops', name: 'Invert Signal', inputs: [{ name: 'sig', type: 'signal' }], outputs: [{ name: 'out', type: 'signal' }], exec: (inputs) => { let s = inputs.sig; if (!s) throw new Error("No signal input"); let out = new Float32Array(s.length); for (let i = 0; i < s.length; i++) out[i] = -s[i]; return { out }; } },
    'MovingAverage': {
        category: 'Signal Ops', name: 'Moving Average Filter',
        inputs: [{ name: 'sig', type: 'signal' }],
        params: [{ name: 'window', type: 'number', default: 5 }],
        outputs: [{ name: 'out', type: 'signal' }],
        exec: (inputs, params) => {
            let s = inputs.sig; if (!s) throw new Error("No signal input");
            let w = parseInt(params.window) || 5;
            if (w < 1) w = 1;
            let out = new Float32Array(s.length);
            let half = Math.floor(w / 2);
            for (let i = 0; i < s.length; i++) {
                let sum = 0, count = 0;
                for (let j = -half; j <= half; j++) {
                    let idx = i + j;
                    if (idx >= 0 && idx < s.length) {
                        sum += s[idx];
                        count++;
                    }
                }
                out[i] = sum / count;
            }
            return { out };
        }
    },

    // --- STATISTICS ---
    'MeanAndStdDev': {
        category: 'Statistics', name: 'Mean & StdDev', inputs: [{ name: 'sig', type: 'signal' }], outputs: [{ name: 'mean', type: 'number' }, { name: 'std', type: 'number' }],
        exec: (inputs) => { let s = inputs.sig; if (!s) throw new Error("No signal input"); let sum = 0; for (let i = 0; i < s.length; i++) sum += s[i]; let mean = sum / s.length; let sq = 0; for (let i = 0; i < s.length; i++) sq += Math.pow(s[i] - mean, 2); let std = Math.sqrt(sq / s.length); return { mean, std }; }
    },
    'MinMaxSignal': { category: 'Statistics', name: 'Signal Min/Max', inputs: [{ name: 'sig', type: 'signal' }], outputs: [{ name: 'min', type: 'number' }, { name: 'max', type: 'number' }], exec: (inputs) => { let s = inputs.sig; if (!s) throw new Error("No signal"); let min = Infinity; let max = -Infinity; for (let i = 0; i < s.length; i++) { if (s[i] < min) min = s[i]; if (s[i] > max) max = s[i]; } return { min, max }; } },
    'OptimalBins': { category: 'Statistics', name: 'Optimal Bins (FD)', inputs: [{ name: 'data', type: 'array' }], outputs: [{ name: 'bins', type: 'number' }], exec: (inputs) => { if (!inputs.data || !window.calculateOptimalBins) throw new Error("Invalid input or missing function"); return { bins: window.calculateOptimalBins(inputs.data) }; } },
    'HistogramBinning': {
        category: 'Statistics', name: 'Histogram Binning', inputs: [{ name: 'sig', type: 'signal' }, { name: 'bins', type: 'number' }], outputs: [{ name: 'centers_x', type: 'array' }, { name: 'counts_y', type: 'array' }],
        exec: (inputs) => {
            let s = inputs.sig; if (!s || s.length < 2) throw new Error("Invalid signal");
            let nb = parseInt(inputs.bins) || 100;
            let min = Infinity, max = -Infinity;
            for (let v of s) { if (v < min) min = v; if (v > max) max = v; }
            let r = max - min; if (r === 0) r = 1; min -= r * 0.02; max += r * 0.02; let w = (max - min) / nb;
            let bins = new Array(nb).fill(0);
            for (let v of s) { let idx = Math.floor((v - min) / w); if (idx >= nb) idx = nb - 1; if (idx < 0) idx = 0; bins[idx]++; }
            let x = [], y = [];
            for (let i = 0; i < nb; i++) { x.push(min + (i + 0.5) * w); y.push(bins[i]); }
            return { centers_x: x, counts_y: y };
        }
    },
    'GaussianFitLM': {
        category: 'Statistics', name: 'Gaussian Fit (LM)',
        inputs: [{ name: 'x', type: 'array' }, { name: 'y', type: 'array' }],
        params: [{ name: 'autoInit', type: 'boolean', default: true }, { name: 'initA', type: 'number', default: 100 }, { name: 'initMu', type: 'number', default: 0 }, { name: 'initSigma', type: 'number', default: 1 }],
        outputs: [{ name: 'A', type: 'number' }, { name: 'mu', type: 'number' }, { name: 'sigma', type: 'number' }],
        exec: (inputs, params) => {
            if (!inputs.x || !inputs.y || !window.fitGaussianLM) throw new Error("Invalid inputs");
            let x = Array.isArray(inputs.x) ? inputs.x : Array.from(inputs.x);
            let y = Array.isArray(inputs.y) ? inputs.y : Array.from(inputs.y);
            let initParams;
            // Use auto-init by default — same logic as the histogram modal
            let autoInit = params.autoInit === 'true' || params.autoInit === true;
            if (autoInit) {
                let maxCount = -Infinity, peakIdx = 0;
                for (let i = 0; i < y.length; i++) { if (y[i] > maxCount) { maxCount = y[i]; peakIdx = i; } }
                let peakCenter = x[peakIdx];
                let sum = 0; for (let v of x) sum += v;
                let mean = sum / x.length;
                let sq = 0; for (let v of x) sq += (v - mean) * (v - mean);
                let sigma = Math.sqrt(sq / x.length) * 0.5;
                initParams = [maxCount, peakCenter, sigma || 1];
            } else {
                initParams = [parseFloat(params.initA), parseFloat(params.initMu), parseFloat(params.initSigma)];
            }
            let res = window.fitGaussianLM(x, y, initParams);
            return { A: res.A, mu: res.mu, sigma: res.sigma };
        }
    },
    'GaussianHistoFit': {
        category: 'Statistics', name: 'Gaussian Histogram Fit',
        inputs: [{ name: 'sig', type: 'signal' }, { name: 'bins', type: 'number' }],
        outputs: [{ name: 'mean', type: 'number' }, { name: 'sigma', type: 'number' }, { name: 'A', type: 'number' }],
        exec: (inputs) => {
            let s = inputs.sig; if (!s || s.length < 2) throw new Error("Invalid signal");
            let nb = parseInt(inputs.bins) || 100;
            if (!window.calculateGaussianHistogram) throw new Error("Missing dependencies, please refresh page");
            let res = window.calculateGaussianHistogram(s, nb);
            if (!res) throw new Error("Calculation failed");
            return { mean: res.fittedMean, sigma: res.fittedSigma, A: res.fittedAmp };
        }
    },
    'KDE': {
        category: 'Statistics', name: 'Kernel Density Estimation',
        inputs: [{ name: 'data', type: 'array' }],
        params: [{ name: 'binCount', type: 'number', default: 100 }],
        outputs: [{ name: 'x', type: 'array' }, { name: 'y', type: 'array' }],
        exec: (inputs, params) => {
            if (!inputs.data || !window.calculateKDE) throw new Error("Missing dependencies");
            let data = Array.isArray(inputs.data) ? inputs.data : Array.from(inputs.data);
            let res = window.calculateKDE(data, parseInt(params.binCount) || 100);
            return { x: res.points.map(p => p[0]), y: res.points.map(p => p[1]) };
        }
    },
    'CalculateR2': { category: 'Statistics', name: 'Calculate R²', inputs: [{ name: 'original', type: 'array' }, { name: 'fit', type: 'array' }], outputs: [{ name: 'r2', type: 'number' }], exec: (inputs) => { if (!inputs.original || !inputs.fit || !window.calculateR2) throw new Error("Missing dependencies"); return { r2: window.calculateR2(inputs.original, inputs.fit) }; } },
    'Solve3x3': { category: 'Statistics', name: 'Solve 3x3 Matrix', inputs: [{ name: 'matrix', type: 'array' }, { name: 'vector', type: 'array' }], outputs: [{ name: 'solution', type: 'array' }], exec: (inputs) => { if (!inputs.matrix || !inputs.vector || !window.solve3x3) throw new Error("Missing dependencies"); return { solution: window.solve3x3(inputs.matrix, inputs.vector) }; } },

    // --- ANALYSIS ---
    'ThresholdDetection': {
        category: 'Analysis', name: 'Threshold Detect',
        inputs: [{ name: 'sig', type: 'signal' }, { name: 'threshold', type: 'number' }],
        params: [
            { name: 'operator', type: 'string', default: '>', options: ['>', '<', '>=', '<='] },
            { name: 'minWidth', type: 'number', default: 10 }
        ],
        outputs: [{ name: 'regions', type: 'array' }],
        exec: (inputs, params) => {
            let s = inputs.sig;
            let thresh = inputs.threshold || 0;
            let mw = parseInt(params.minWidth);
            let op = params.operator || '>';
            if (!s) throw new Error("No signal input");

            const compareFn = {
                '<': (v, t) => v < t,
                '>': (v, t) => v > t,
                '<=': (v, t) => v <= t,
                '>=': (v, t) => v >= t
            }[op] || ((v, t) => v > t);

            let regions = [];
            let inR = false;
            let start = -1;
            for (let i = 0; i < s.length; i++) {
                if (compareFn(s[i], thresh)) {
                    if (!inR) { inR = true; start = i; }
                } else {
                    if (inR) { inR = false; if (i - start >= mw) regions.push({ start, end: i - 1 }); }
                }
            }
            if (inR && s.length - start >= mw) regions.push({ start, end: s.length - 1 });
            return { regions };
        }
    },
    'FindLabeledRegions': { category: 'Analysis', name: 'Find Labeled Regions', inputs: [{ name: 'labels', type: 'array' }], params: [{ name: 'classId', type: 'number', default: 2 }], outputs: [{ name: 'regions', type: 'array' }], exec: (inputs, params) => { if (!inputs.labels || !window.findLabeledRegions) throw new Error("Missing dependencies"); return { regions: window.findLabeledRegions(inputs.labels, parseInt(params.classId)) }; } },
    'ExpandPeaks': { 
        category: 'Analysis', name: 'Expand Peaks to Baseline', 
        inputs: [{ name: 'sig', type: 'signal' }, { name: 'regions', type: 'array' }, { name: 'baseline', type: 'number' }], 
        outputs: [{ name: 'expanded', type: 'array' }], 
        exec: (inputs) => { 
            let data = inputs.sig;
            let regs = inputs.regions;
            let baseline = inputs.baseline !== undefined ? inputs.baseline : 0;
            if (!data || !regs) return { expanded: [] };

            // Deep clone regions to avoid modifying original array objects
            let expanded = regs.map(r => ({ ...r }));

            expanded.forEach(seg => {
                // Peak yönünü belirle: En yüksek mutlak sapma yönü
                let maxDev = 0;
                let peakDir = 1; // 1: Pozitif, -1: Negatif
                for (let i = seg.start; i <= seg.end; i++) {
                    let dev = data[i] - baseline;
                    if (Math.abs(dev) > Math.abs(maxDev)) {
                        maxDev = dev;
                        peakDir = dev >= 0 ? 1 : -1;
                    }
                }

                let left = seg.start - 1;
                if (peakDir === 1) {
                    while (left >= 0 && data[left] > baseline) {
                        left--;
                    }
                } else {
                    while (left >= 0 && data[left] < baseline) {
                        left--;
                    }
                }
                seg.start = left + 1;

                let right = seg.end + 1;
                if (peakDir === 1) {
                    while (right < data.length && data[right] > baseline) {
                        right++;
                    }
                } else {
                    while (right < data.length && data[right] < baseline) {
                        right++;
                    }
                }
                seg.end = right - 1;
            });

            return { expanded };
        } 
    },
    'FilterRegions': {
        category: 'Analysis', name: 'Filter Regions',
        inputs: [{ name: 'regions', type: 'array' }, { name: 'threshold', type: 'number' }],
        params: [
            { name: 'property', type: 'string', default: 'max', options: ['max', 'min', 'peakVal', 'charge', 'area', 'energy', 'width', 'fwhm'] },
            { name: 'operator', type: 'string', default: '<', options: ['<', '>', '<=', '>=', '==', '!='] },
            { name: 'threshold', type: 'number', default: 0 },
            { name: 'multiplier', type: 'string', default: '1' }
        ],
        outputs: [{ name: 'filtered', type: 'array' }],
        exec: (inputs, params) => {
            let regs = inputs.regions;
            if (!regs || !Array.isArray(regs)) return { filtered: [] };
            let prop = params.property || 'max';
            let op = params.operator || '<';
            let thresh = inputs.threshold !== undefined ? inputs.threshold : (parseFloat(params.threshold) || 0);
            let mult = parseFloat(params.multiplier);
            if (isNaN(mult)) mult = 1;
            thresh *= mult;

            const compareFn = {
                '<': (v, t) => v < t,
                '>': (v, t) => v > t,
                '<=': (v, t) => v <= t,
                '>=': (v, t) => v >= t,
                '==': (v, t) => Math.abs(v - t) < 1e-10,
                '!=': (v, t) => Math.abs(v - t) >= 1e-10
            }[op] || ((v, t) => v < t);

            let filtered = regs.filter(r => {
                let val = r[prop];
                if (val === undefined) return false;
                return compareFn(val, thresh);
            });
            return { filtered };
        }
    },
    'SetRegionLabel': {
        category: 'Analysis', name: 'Set Region Label',
        inputs: [{ name: 'regions', type: 'array' }, { name: 'threshold', type: 'number' }],
        params: [
            { name: 'property', type: 'string', default: 'charge', options: ['max', 'min', 'peakVal', 'charge', 'area', 'energy', 'width', 'fwhm'] },
            { name: 'operator', type: 'string', default: '>', options: ['<', '>', '<=', '>=', '==', '!='] },
            { name: 'threshold', type: 'number', default: 0 },
            { name: 'multiplier', type: 'string', default: '1' },
            { name: 'trueLabel', type: 'number', default: 3 },
            { name: 'falseLabel', type: 'number', default: 2 }
        ],
        outputs: [{ name: 'out_regions', type: 'array' }],
        exec: (inputs, params) => {
            let regs = inputs.regions;
            if (!regs || !Array.isArray(regs)) return { out_regions: [] };
            let prop = params.property || 'charge';
            let op = params.operator || '>';
            let thresh = inputs.threshold !== undefined ? inputs.threshold : (parseFloat(params.threshold) || 0);
            let mult = parseFloat(params.multiplier);
            if (isNaN(mult)) mult = 1;
            thresh *= mult;
            let tLab = parseInt(params.trueLabel) || 3;
            let fLab = parseInt(params.falseLabel) || 2;

            const compareFn = {
                '<': (v, t) => v < t,
                '>': (v, t) => v > t,
                '<=': (v, t) => v <= t,
                '>=': (v, t) => v >= t,
                '==': (v, t) => Math.abs(v - t) < 1e-10,
                '!=': (v, t) => Math.abs(v - t) >= 1e-10
            }[op] || ((v, t) => v > t);

            let out_regions = regs.map(r => {
                let val = r[prop];
                let newLabel = fLab;
                if (val !== undefined && compareFn(val, thresh)) {
                    newLabel = tLab;
                }
                return { ...r, label: newLabel };
            });
            return { out_regions };
        }
    },

    // --- PHYSICS ---
    'CalculatePhysics': {
        category: 'Physics', name: 'Physics Metrics', inputs: [{ name: 'sig', type: 'signal' }, { name: 'regions', type: 'array' }, { name: 'base', type: 'number' }], outputs: [{ name: 'results', type: 'array' }],
        exec: (inputs) => { let s = inputs.sig; let regs = inputs.regions; let base = inputs.base || 0; if (!s || !regs) throw new Error("Missing inputs"); const physParams = window.getPhysicsParams ? window.getPhysicsParams() : { V_offset: 0, R: 50, dt: 1e-9 }; let results = []; for (let r of regs) { let area = 0; let sumSq = 0; let max = -Infinity; let min = Infinity; let maxIdx = -1; let minIdx = -1; for (let j = r.start; j <= r.end; j++) { let val = s[j]; if (val > max) { max = val; maxIdx = j; } if (val < min) { min = val; minIdx = j; } let diff = val - base; area += diff; sumSq += (diff * diff); } let isNeg = Math.abs(min - base) > Math.abs(max - base); let peakVal = isNeg ? min : max; let peakIdx = isNeg ? minIdx : maxIdx; let fwhm = window.calculateFWHM ? window.calculateFWHM(s, r.start, r.end, peakVal, peakIdx, base) : 0; let phys = window.calculatePhysicsMetrics ? window.calculatePhysicsMetrics({ area, sumVSq: sumSq }, physParams) : { charge: 0, energy: 0, energyEV: 0 }; results.push({ ...r, width: r.end - r.start + 1, fwhm, max, min, peakVal, area, sumSq, charge: phys.charge, energy: phys.energy, energyEV: phys.energyEV, base }); } return { results }; }
    },
    'ChargeCalculation': { category: 'Physics', name: 'Calculate Charge', inputs: [{ name: 'area', type: 'number' }], params: [{ name: 'R', type: 'number', default: 50 }, { name: 'dt', type: 'number', default: 1e-9 }], outputs: [{ name: 'charge', type: 'number' }], exec: (inputs, params) => { if (!window.calculateCharge) throw new Error("Missing calculateCharge function"); return { charge: window.calculateCharge(inputs.area || 0, parseFloat(params.R), parseFloat(params.dt)) }; } },
    'EnergyCalculation': { category: 'Physics', name: 'Calculate Energy', inputs: [{ name: 'sumVSq', type: 'number' }], params: [{ name: 'R', type: 'number', default: 50 }, { name: 'dt', type: 'number', default: 1e-9 }], outputs: [{ name: 'energy', type: 'number' }], exec: (inputs, params) => { if (!window.calculateEnergy) throw new Error("Missing calculateEnergy function"); return { energy: window.calculateEnergy(inputs.sumVSq || 0, parseFloat(params.R), parseFloat(params.dt)) }; } },

    // --- OUTPUT ---
    'DisplayValue': {
        category: 'Output', name: 'Display Value', inputs: [{ name: 'val', type: 'any' }], outputs: [],
        exec: (inputs, params, node) => {
            let val = inputs.val;
            if (val === undefined) return {};
            let displayDiv = node.el.querySelector('.ne-display-val');
            if (!displayDiv) {
                displayDiv = document.createElement('div');
                displayDiv.className = 'ne-display-val';
                displayDiv.style.padding = '5px';
                displayDiv.style.marginTop = '10px';
                displayDiv.style.background = 'var(--bg-color, rgba(0,0,0,0.1))';
                displayDiv.style.borderRadius = '3px';
                displayDiv.style.fontSize = '12px';
                displayDiv.style.wordBreak = 'break-all';
                displayDiv.style.maxHeight = '60px';
                displayDiv.style.overflow = 'auto';
                node.el.appendChild(displayDiv);
            }
            if (typeof val === 'number') displayDiv.textContent = val.toString().length > 10 ? val.toFixed(6) : val;
            else if (val instanceof Float32Array || val instanceof Int8Array || val instanceof Uint8Array || Array.isArray(val)) displayDiv.textContent = `Array [${val.length}]`;
            else if (typeof val === 'object') displayDiv.textContent = JSON.stringify(val);
            else displayDiv.textContent = String(val);
            return {};
        }
    },
    'SetBaseline': {
        category: 'Output', name: 'Set Env Baseline', inputs: [{ name: 'val', type: 'number' }], outputs: [],
        exec: (inputs) => { let val = inputs.val || 0; if (window.updateState) window.updateState({ baselineValue: val, isBaselineEnabled: true }); if (elements.baselineInput) elements.baselineInput.value = val; if (elements.baselineToggle) elements.baselineToggle.checked = true; return {}; }
    },
    'SetSignal': {
        category: 'Output', name: 'Set Global Signal',
        inputs: [{ name: 'sig', type: 'any' }], outputs: [],
        exec: (inputs) => {
            let sig = inputs.sig;
            if (!sig) return {};
            // Ensure Float32Array
            if (!(sig instanceof Float32Array)) {
                if (Array.isArray(sig) || sig instanceof Int8Array || sig instanceof Uint8Array) {
                    sig = new Float32Array(sig);
                } else return {};
            }
            if (window.updateState) {
                // Resize labels if signal length changed
                if (state.labels && state.labels.length !== sig.length) {
                    let newLabels = new Int8Array(sig.length);
                    newLabels.set(state.labels.subarray(0, Math.min(state.labels.length, sig.length)));
                    window.updateState({ signal: sig, labels: newLabels });
                } else {
                    window.updateState({ signal: sig });
                }
            }
            window.rescaleSignalView();
            return {};
        }
    },
    'AddReference': {
        category: 'Output', name: 'Add as Reference',
        inputs: [{ name: 'sig', type: 'any' }],
        params: [{ name: 'name', type: 'string', default: 'Ref' }],
        outputs: [],
        exec: (inputs, params) => {
            let sig = inputs.sig;
            if (!sig) return {};
            if (!(sig instanceof Float32Array)) {
                if (Array.isArray(sig) || sig instanceof Int8Array || sig instanceof Uint8Array) {
                    sig = new Float32Array(sig);
                } else return {};
            }
            let name = params.name || ('Ref_' + Date.now());
            state.referenceSignals.push({
                name: name,
                data: sig,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
            });
            return {};
        }
    },
    'ApplyLabels': {
        category: 'Output', name: 'Apply to Global Labels', inputs: [{ name: 'regions', type: 'array' }], params: [{ name: 'classId', type: 'number', default: 2 }], outputs: [],
        exec: (inputs, params) => {
            let regs = inputs.regions;
            let cls = parseInt(params.classId);
            if (!regs || !state.signal) return {};
            let labels = state.labels;
            if (!labels || labels.length !== state.signal.length) {
                labels = new Int8Array(state.signal.length);
            } else {
                labels = new Int8Array(labels); // Clone it to accumulate
            }
            for (let r of regs) {
                let rCls = r.label !== undefined ? r.label : cls;
                for (let i = r.start; i <= r.end; i++) labels[i] = rCls;
            }
            if (window.updateState) window.updateState({ labels });
            return {};
        }
    },
    'DisplayResults': {
        category: 'Output', name: 'Table Analysis Data', inputs: [{ name: 'results', type: 'array' }], outputs: [],
        exec: (inputs) => {
            if (!inputs.results) return {};
            if (!window.analysisData) window.analysisData = [];
            let currentOffset = window.analysisData.length;
            let newData = inputs.results.map((r, i) => ({ id: currentOffset + i + 1, label: r.label !== undefined ? r.label : 2, ...r }));
            window.analysisData = window.analysisData.concat(newData);
            return {};
        }
    },
    'SaveSignal': {
        category: 'Output', name: 'Save Signal',
        inputs: [{ name: 'sig', type: 'signal' }, { name: 'filename', type: 'any' }],
        params: [{ name: 'defaultName', type: 'string', default: 'exported_signal' }],
        outputs: [],
        exec: (inputs, params, node) => {
            let sig = inputs.sig;
            if (!sig) return {};
            let name = inputs.filename || params.defaultName || 'signal';
            if (!name.endsWith('.csv')) name += '.csv';

            // Prevent excessive download spam if inputs haven't changed
            if (node.lastSavedSignal === sig && node.lastSavedFilename === name) {
                return {};
            }
            node.lastSavedSignal = sig;
            node.lastSavedFilename = name;

            let rows = [];
            for (let i = 0; i < sig.length; i++) {
                rows.push(`${i},${sig[i]}`);
            }
            let csvContent = "index,voltage\n" + rows.join("\n");

            let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            let url = URL.createObjectURL(blob);
            let link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", name);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            return {};
        }
    }
};

// --- 2. CORE CLASSES ---

class Node {
    constructor(id, type, x, y) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.def = NODE_TYPES[type];
        this.params = {};

        if (this.def.params) {
            this.def.params.forEach(p => {
                this.params[p.name] = p.default;
            });
        }

        // Element initialization deferred to DOM render
        this.el = null;
    }
}

class NodeEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvasWrap = this.container.querySelector('.ne-canvas-wrap');
        this.canvas = this.container.querySelector('.ne-canvas');
        this.svg = this.container.querySelector('.ne-svg-layer');
        this.palette = this.container.querySelector('.ne-palette');

        this.nodes = {};
        this.connections = []; // { fromNode, fromPort, toNode, toPort, pathEl }

        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;

        this.isDragging = false;
        this.dragNode = null;
        this.lastMouse = { x: 0, y: 0 };

        this.isConnecting = false;
        this.connectStart = null; // { node, port, type: 'output'|'input', el }
        this.tempLine = null;

        this.selectedNodes = new Set();
        this.selectedConnections = new Set();

        this.idCounter = 1;

        this.initDOM();
        this.initEvents();
        this.buildPalette();
    }

    // --- INIT ---
    initDOM() {
        this.tempLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.tempLine.setAttribute("class", "ne-temp-connection");
        this.svg.appendChild(this.tempLine);
    }

    buildPalette() {
        let content = '';
        for (let cat of NODE_CATEGORIES) {
            let catNodes = Object.keys(NODE_TYPES).filter(k => NODE_TYPES[k].category === cat);
            if (catNodes.length === 0) continue;

            // Categories start collapsed by default
            content += `<div class="ne-palette-category collapsed">
                <div class="ne-palette-category-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="ne-cat-dot" style="background: var(--ne-cat-${cat.toLowerCase().replace(' ', '')})"></span>
                    ${cat}
                    <span class="ne-cat-chevron">▼</span>
                </div>
                <div class="ne-palette-items">`;

            for (let type of catNodes) {
                content += `<div class="ne-palette-item" draggable="true" data-type="${type}" data-search-name="${NODE_TYPES[type].name.toLowerCase()}">
                    <span class="ne-item-icon">⚡</span>
                    ${NODE_TYPES[type].name}
                </div>`;
            }
            content += `</div></div>`;
        }
        this.palette.querySelector('.ne-palette-list').innerHTML = content;

        // Drag events for palette
        this.palette.querySelectorAll('.ne-palette-item').forEach(item => {
            item.addEventListener('dragstart', e => {
                e.dataTransfer.setData('application/node-type', e.target.closest('[data-type]').dataset.type);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Search filtering
        const searchInput = this.palette.querySelector('.ne-palette-search input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase().trim();
                const categories = this.palette.querySelectorAll('.ne-palette-category');

                categories.forEach(catEl => {
                    const items = catEl.querySelectorAll('.ne-palette-item');
                    let hasVisibleItem = false;

                    items.forEach(item => {
                        const name = item.dataset.searchName || '';
                        const typeKey = (item.dataset.type || '').toLowerCase();
                        const match = !query || name.includes(query) || typeKey.includes(query);
                        item.style.display = match ? '' : 'none';
                        if (match) hasVisibleItem = true;
                    });

                    // Hide entire category if no items match
                    catEl.style.display = hasVisibleItem ? '' : 'none';

                    // When searching, expand matching categories; when cleared, collapse all
                    if (query && hasVisibleItem) {
                        catEl.classList.remove('collapsed');
                    } else if (!query) {
                        catEl.classList.add('collapsed');
                    }
                });
            });
        }
    }

    initEvents() {
        // Canvas Zoom (scroll wheel directly)
        this.canvasWrap.addEventListener('wheel', e => {
            e.preventDefault();
            const zoomFactor = 0.001;
            const minZoom = 0.15;
            const maxZoom = 3.0;
            let newScale = this.scale - e.deltaY * zoomFactor;
            newScale = Math.max(minZoom, Math.min(newScale, maxZoom));

            // Zoom around mouse
            const rect = this.canvasWrap.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            this.offsetX += mouseX / this.scale - mouseX / newScale;
            this.offsetY += mouseY / this.scale - mouseY / newScale;
            this.scale = newScale;
            this.updateTransform();
            this.updateMinimap();
        });

        // Middle mouse button pan
        this.canvasWrap.addEventListener('mousedown', e => {
            if (e.button === 1) {
                // Middle mouse: pan
                e.preventDefault();
                this.isPanning = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.canvasWrap.style.cursor = 'grabbing';
            } else if (e.button === 0 && (e.target === this.canvasWrap || e.target === this.canvas)) {
                // Left click on empty canvas: clear selection only
                this.clearSelection();
            }
        });

        // Prevent middle-click default (auto-scroll icon)
        this.canvasWrap.addEventListener('auxclick', e => {
            if (e.button === 1) e.preventDefault();
        });

        // Drop Node
        this.canvasWrap.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        this.canvasWrap.addEventListener('drop', e => {
            e.preventDefault();
            let type = e.dataTransfer.getData('application/node-type');
            if (type) {
                const rect = this.canvasWrap.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale + this.offsetX;
                const y = (e.clientY - rect.top) / this.scale + this.offsetY;
                this.createNode(type, x, y);
            }
        });

        // Global mouse move/up
        document.addEventListener('mousemove', e => {
            if (this.isPanning) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.offsetX -= dx / this.scale;
                this.offsetY -= dy / this.scale;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.updateTransform();
                this.updateMinimap();
            } else if (this.isDragging && this.dragNode) {
                const dx = (e.clientX - this.lastMouse.x) / this.scale;
                const dy = (e.clientY - this.lastMouse.y) / this.scale;
                this.dragNode.x += dx;
                this.dragNode.y += dy;
                this.dragNode.el.style.transform = `translate(${this.dragNode.x}px, ${this.dragNode.y}px)`;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.updateConnectionsForNode(this.dragNode.id);
            } else if (this.isConnecting) {
                const rect = this.canvas.getBoundingClientRect();
                const mx = (e.clientX - rect.left) / this.scale;
                const my = (e.clientY - rect.top) / this.scale;

                const pt = this.getPortCenter(this.connectStart.el);
                this.tempLine.setAttribute("d", this.createBezierPath(pt.x, pt.y, mx, my, this.connectStart.type));
            }
        });

        document.addEventListener('mouseup', e => {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvasWrap.style.cursor = '';
            }
            if (this.isDragging) {
                this.isDragging = false;
                if (this.dragNode) this.dragNode.el.classList.remove('dragging');
                this.dragNode = null;
                this.updateMinimap();
            }
            if (this.isConnecting) {
                this.isConnecting = false;
                this.tempLine.setAttribute("d", "");
                // Connection completion logic is handled by mouseup on port
            }
        });

        // Delete key
        document.addEventListener('keydown', e => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT') {
                this.deleteSelected();
            }
        });
    }

    // --- VISUAL TRANSFORMS ---
    updateTransform() {
        this.canvas.style.transform = `scale(${this.scale}) translate(${-this.offsetX}px, ${-this.offsetY}px)`;
        // Update zoom info display
        const zoomInfo = this.container.querySelector('.ne-zoom-info span.ne-zoom-pct');
        if (zoomInfo) zoomInfo.textContent = `${Math.round(this.scale * 100)}%`;
    }

    // --- NODE MANAGEMENT ---
    createNode(type, x, y, forceId = null) {
        let id = forceId ? forceId : 'n' + (this.idCounter++);
        let n = new Node(id, type, x, y);
        this.nodes[id] = n;

        let el = document.createElement('div');
        el.className = 'ne-node';
        el.dataset.id = id;
        el.style.transform = `translate(${x}px, ${y}px)`;

        let catColor = `var(--ne-cat-${n.def.category.toLowerCase().replace(' ', '')})`;

        let html = `
            <div class="ne-node-header" style="background: ${catColor}">
                <span class="ne-node-icon">⚡</span>
                ${n.def.name}
                <button class="ne-node-delete" onclick="window.nodeEditor.deleteNode('${id}')">✕</button>
            </div>
            <div class="ne-node-body">`;

        if (n.def.inputs) {
            n.def.inputs.forEach(inp => {
                html += `<div class="ne-port-row input">
                    <div class="ne-port input" data-node="${id}" data-port="${inp.name}" data-type="input" data-port-type="${inp.type}" title="${inp.type}"></div>
                    <span class="ne-port-label">${inp.name}</span>
                </div>`;
            });
        }

        if (n.def.outputs) {
            n.def.outputs.forEach(out => {
                html += `<div class="ne-port-row output">
                    <span class="ne-port-label">${out.name}</span>
                    <div class="ne-port output" data-node="${id}" data-port="${out.name}" data-type="output" data-port-type="${out.type}" title="${out.type}"></div>
                </div>`;
            });
        }

        html += `</div>`;

        if (n.def.params) {
            html += `<div class="ne-node-params">`;
            n.def.params.forEach(p => {
                html += `<div class="ne-param-row">
                    <label>${p.name}</label>`;
                if (p.options) {
                    html += `<select data-param="${p.name}" onchange="window.nodeEditor.updateParam('${id}', '${p.name}', this.value)">`;
                    p.options.forEach(opt => {
                        html += `<option value="${opt}" ${n.params[p.name] === opt ? 'selected' : ''}>${opt}</option>`;
                    });
                    html += `</select>`;
                } else {
                    html += `<input type="text" data-param="${p.name}" value="${n.params[p.name]}" onchange="window.nodeEditor.updateParam('${id}', '${p.name}', this.value)">`;
                }
                html += `</div>`;
            });
            html += `</div>`;
        }

        el.innerHTML = html;
        this.canvas.appendChild(el);
        n.el = el;

        if (n.def.init) {
            n.def.init(n);
        }

        // Node Drag interactions
        el.addEventListener('mousedown', e => {
            if (e.target.classList.contains('ne-port') || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            e.stopPropagation();
            if (!e.shiftKey) this.clearSelection();
            this.selectNode(id, true);
            this.isDragging = true;
            this.dragNode = n;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            n.el.classList.add('dragging');
        });

        // Port wiring
        el.querySelectorAll('.ne-port').forEach(port => {
            port.addEventListener('mousedown', e => {
                e.stopPropagation();
                this.isConnecting = true;
                this.connectStart = {
                    node: id,
                    port: port.dataset.port,
                    type: port.dataset.type,
                    portType: port.dataset.portType,
                    el: port
                };
            });

            port.addEventListener('mouseup', e => {
                e.stopPropagation();
                if (this.isConnecting && this.connectStart.node !== id) {
                    if (this.connectStart.type !== port.dataset.type) {
                        let from = this.connectStart.type === 'output' ? this.connectStart : { node: id, port: port.dataset.port, type: port.dataset.type, el: port };
                        let to = this.connectStart.type === 'input' ? this.connectStart : { node: id, port: port.dataset.port, type: port.dataset.type, el: port };

                        this.addConnection(from.node, from.port, to.node, to.port);
                    }
                }
                this.isConnecting = false;
                this.tempLine.setAttribute("d", "");
            });
        });
        this.updateMinimap();
    }

    deleteNode(id) {
        if (!this.nodes[id]) return;

        // Remove connections
        this.connections = this.connections.filter(c => {
            if (c.fromNode === id || c.toNode === id) {
                c.pathEl.remove();
                return false;
            }
            return true;
        });
        this.updatePortStyles();

        this.nodes[id].el.remove();
        delete this.nodes[id];
        this.selectedNodes.delete(id);
        this.updateMinimap();
    }

    updateParam(id, param, value) {
        if (this.nodes[id]) this.nodes[id].params[param] = value;
    }

    // --- CONNECTIONS ---
    addConnection(fromN, fromP, toN, toP) {
        // Prevent multiple inputs to same port
        let existing = this.connections.findIndex(c => c.toNode === toN && c.toPort === toP);
        if (existing >= 0) {
            this.connections[existing].pathEl.remove();
            this.connections.splice(existing, 1);
        }

        // Check cyles
        if (!this.checkDAG(fromN, toN)) return alert("Cycle detected!");

        let pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("class", "ne-connection");
        let portColor = `var(--ne-port-${this.nodes[fromN].def.outputs.find(o => o.name === fromP).type})`;
        pathEl.setAttribute("stroke", portColor);

        pathEl.addEventListener('click', e => {
            e.stopPropagation();
            if (!e.shiftKey) this.clearSelection();
            this.selectedConnections.add(pathEl);
            pathEl.classList.add('selected');
        });
        pathEl.addEventListener('dblclick', e => {
            e.stopPropagation();
            this.deleteConnection(pathEl);
        });

        this.svg.appendChild(pathEl);

        let conn = { fromNode: fromN, fromPort: fromP, toNode: toN, toPort: toP, pathEl };
        this.connections.push(conn);

        this.updateConnectionPath(conn);
        this.updatePortStyles();
    }

    deleteConnection(pathEl) {
        let idx = this.connections.findIndex(c => c.pathEl === pathEl);
        if (idx >= 0) {
            pathEl.remove();
            this.connections.splice(idx, 1);
            this.selectedConnections.delete(pathEl);
            this.updatePortStyles();
        }
    }

    updateConnectionPath(conn) {
        let n1 = this.nodes[conn.fromNode].el;
        let p1 = n1.querySelector(`.ne-port[data-port="${conn.fromPort}"][data-type="output"]`);
        let n2 = this.nodes[conn.toNode].el;
        let p2 = n2.querySelector(`.ne-port[data-port="${conn.toPort}"][data-type="input"]`);

        if (p1 && p2) {
            let pt1 = this.getPortCenter(p1);
            let pt2 = this.getPortCenter(p2);
            conn.pathEl.setAttribute("d", this.createBezierPath(pt1.x, pt1.y, pt2.x, pt2.y, 'output'));
        }
    }

    updateConnectionsForNode(id) {
        this.connections.forEach(c => {
            if (c.fromNode === id || c.toNode === id) this.updateConnectionPath(c);
        });
    }

    createBezierPath(x1, y1, x2, y2, startType) {
        let offset = Math.max(Math.abs(x2 - x1) / 2, 50);
        if (startType === 'input') {
            return `M ${x1} ${y1} C ${x1 - offset} ${y1}, ${x2 + offset} ${y2}, ${x2} ${y2}`;
        } else {
            return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
        }
    }

    getPortCenter(el) {
        // Find position relative to canvas
        const canvasRect = this.canvas.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return {
            x: (rect.left + rect.width / 2 - canvasRect.left) / this.scale,
            y: (rect.top + rect.height / 2 - canvasRect.top) / this.scale
        };
    }

    updatePortStyles() {
        this.container.querySelectorAll('.ne-port.connected').forEach(p => p.classList.remove('connected'));
        this.connections.forEach(c => {
            let n1 = this.nodes[c.fromNode].el.querySelector(`.ne-port[data-port="${c.fromPort}"][data-type="output"]`);
            let n2 = this.nodes[c.toNode].el.querySelector(`.ne-port[data-port="${c.toPort}"][data-type="input"]`);
            if (n1) n1.classList.add('connected');
            if (n2) n2.classList.add('connected');
        });
    }

    // --- SELECTION ---
    selectNode(id, keepOthers) {
        let n = this.nodes[id];
        if (!n) return;
        this.selectedNodes.add(id);
        n.el.classList.add('selected');
    }

    clearSelection() {
        this.selectedNodes.forEach(id => {
            if (this.nodes[id]) this.nodes[id].el.classList.remove('selected');
        });
        this.selectedNodes.clear();

        this.selectedConnections.forEach(el => el.classList.remove('selected'));
        this.selectedConnections.clear();
    }

    clear() {
        // Copy keys first — deleteNode modifies this.nodes during iteration
        const ids = Object.keys(this.nodes);
        ids.forEach(id => this.deleteNode(id));
        this.connections.forEach(c => c.pathEl.remove());
        this.connections = [];
        if (this.tempLine) this.tempLine.setAttribute("d", "");
        this.idCounter = 1;
        this.offsetX = 0; this.offsetY = 0; this.scale = 1;
        this.updateTransform();
    }

    deleteSelected() {
        Array.from(this.selectedNodes).forEach(id => this.deleteNode(id));
        Array.from(this.selectedConnections).forEach(el => this.deleteConnection(el));
        this.updateMinimap();
    }

    // --- FIT VIEW ---
    fitView() {
        const nodeIds = Object.keys(this.nodes);
        if (nodeIds.length === 0) {
            this.offsetX = 0; this.offsetY = 0; this.scale = 1;
            this.updateTransform();
            this.updateMinimap();
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeIds.forEach(id => {
            const n = this.nodes[id];
            const w = n.el.offsetWidth || 180;
            const h = n.el.offsetHeight || 100;
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + w > maxX) maxX = n.x + w;
            if (n.y + h > maxY) maxY = n.y + h;
        });

        const padding = 60;
        const contentW = maxX - minX + padding * 2;
        const contentH = maxY - minY + padding * 2;

        const wrapRect = this.canvasWrap.getBoundingClientRect();
        const viewW = wrapRect.width;
        const viewH = wrapRect.height;

        this.scale = Math.min(viewW / contentW, viewH / contentH, 1.5);
        this.scale = Math.max(0.15, Math.min(this.scale, 3.0));

        this.offsetX = minX - padding + (contentW - viewW / this.scale) / 2;
        this.offsetY = minY - padding + (contentH - viewH / this.scale) / 2;

        this.updateTransform();
        // Defer connection update for layout to settle
        requestAnimationFrame(() => {
            this.connections.forEach(c => this.updateConnectionPath(c));
            this.updateMinimap();
        });
    }

    // --- MINIMAP ---
    updateMinimap() {
        const minimap = this.container.querySelector('.ne-minimap');
        if (!minimap) return;

        const mmW = minimap.clientWidth;
        const mmH = minimap.clientHeight;

        const nodeIds = Object.keys(this.nodes);
        if (nodeIds.length === 0) {
            minimap.innerHTML = '';
            return;
        }

        // Calculate bounds of all nodes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeIds.forEach(id => {
            const n = this.nodes[id];
            const w = n.el.offsetWidth || 180;
            const h = n.el.offsetHeight || 80;
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + w > maxX) maxX = n.x + w;
            if (n.y + h > maxY) maxY = n.y + h;
        });

        const pad = 100;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;
        const scaleF = Math.min(mmW / worldW, mmH / worldH);

        let html = '';

        // Draw nodes as colored rectangles
        nodeIds.forEach(id => {
            const n = this.nodes[id];
            const nw = (n.el.offsetWidth || 180) * scaleF;
            const nh = (n.el.offsetHeight || 80) * scaleF;
            const nx = (n.x - minX) * scaleF;
            const ny = (n.y - minY) * scaleF;
            const catColor = `var(--ne-cat-${n.def.category.toLowerCase().replace(' ', '')})`;
            html += `<div class="ne-minimap-node" style="left:${nx}px;top:${ny}px;width:${nw}px;height:${nh}px;background:${catColor}"></div>`;
        });

        // Draw viewport rectangle
        const wrapRect = this.canvasWrap.getBoundingClientRect();
        const vpLeft = (this.offsetX - minX) * scaleF;
        const vpTop = (this.offsetY - minY) * scaleF;
        const vpW = (wrapRect.width / this.scale) * scaleF;
        const vpH = (wrapRect.height / this.scale) * scaleF;
        html += `<div class="ne-minimap-viewport" style="left:${vpLeft}px;top:${vpTop}px;width:${vpW}px;height:${vpH}px"></div>`;

        minimap.innerHTML = html;
    }

    // --- EXECUTION (TOPOLOGICAL SORT) ---
    checkDAG(fromN, toN) {
        let visited = new Set();
        let dfs = (nId) => {
            if (nId === fromN) return false; // Cycle forms
            if (visited.has(nId)) return true;
            visited.add(nId);
            let outs = this.connections.filter(c => c.fromNode === nId).map(c => c.toNode);
            for (let out of outs) {
                if (!dfs(out)) return false;
            }
            return true;
        };
        return dfs(toN);
    }

    getExecutionOrder() {
        let degrees = {};
        for (let id in this.nodes) degrees[id] = 0;

        this.connections.forEach(c => degrees[c.toNode]++);

        let queue = Object.keys(degrees).filter(id => degrees[id] === 0);
        let order = [];

        while (queue.length > 0) {
            let u = queue.shift();
            order.push(u);

            this.connections.filter(c => c.fromNode === u).forEach(c => {
                degrees[c.toNode]--;
                if (degrees[c.toNode] === 0) queue.push(c.toNode);
            });
        }

        if (order.length !== Object.keys(this.nodes).length) return null; // Cycle
        return order;
    }

    async run() {
        const order = this.getExecutionOrder();
        if (!order) return alert("Error: Pipeline contains cycles.");

        // Reset styles
        Object.values(this.nodes).forEach(n => {
            n.el.classList.remove('executing', 'error', 'success');
        });

        // Prepare accumulation targets if these output nodes are present
        if (order.some(id => this.nodes[id].type === 'ApplyLabels') && window.state && window.state.signal) {
            window.updateState({ labels: new Int8Array(window.state.signal.length) });
        }
        if (order.some(id => this.nodes[id].type === 'DisplayResults')) {
            window.analysisData = [];
        }

        let contextOutputs = {}; // node_id: { port: val }

        for (let id of order) {
            let n = this.nodes[id];
            n.el.classList.add('executing');

            // Gather inputs
            let inputs = {};
            this.connections.filter(c => c.toNode === id).forEach(c => {
                let outData = contextOutputs[c.fromNode] || {};
                inputs[c.toPort] = outData[c.fromPort];
            });

            try {
                // Mock delay for visual effect
                await new Promise(r => setTimeout(r, 100));

                let res = n.def.exec(inputs, n.params, n); // Pass "n" for DOM access
                contextOutputs[id] = res;
                n.el.classList.replace('executing', 'success');
            } catch (e) {
                console.error("Node error: ", id, e);
                n.el.classList.replace('executing', 'error');
                alert(`Error in ${n.def.name}: ${e.message}`);
                break;
            }
        }

        // Finalize
        Object.values(this.nodes).forEach(n => n.el.classList.remove('executing'));
        if (window.updatePeakAnalysis) window.updatePeakAnalysis(null, true);
        if (window.draw) window.draw(true);
    }

    // --- IO ---
    serialize() {
        return JSON.stringify({
            version: 1,
            nodes: Object.values(this.nodes).map(n => ({
                id: n.id, type: n.type, x: n.x, y: n.y, params: n.params
            })),
            connections: this.connections.map(c => ({
                fromNode: c.fromNode, fromPort: c.fromPort,
                toNode: c.toNode, toPort: c.toPort
            }))
        });
    }

    exportPipeline() {
        try {
            let json = this.serialize();
            let blob = new Blob([json], { type: 'application/json' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = 'pipeline_' + Date.now() + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Export failed:', e);
            alert('Export failed: ' + e.message);
        }
    }

    importPipeline() {
        let inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.onchange = () => {
            let f = inp.files[0];
            if (!f) return;
            let r = new FileReader();
            r.onload = (e) => { this.load(e.target.result); };
            r.readAsText(f);
        };
        inp.click();
    }

    load(jsonStr) {
        try {
            let data = JSON.parse(jsonStr);
            this.clear();

            this.offsetX = 0; this.offsetY = 0; this.scale = 1; this.updateTransform();

            let maxId = 0;
            data.nodes.forEach(n => {
                if (!NODE_TYPES[n.type]) {
                    console.warn(`Unknown node type: ${n.type}, skipping`);
                    return;
                }
                this.createNode(n.type, n.x, n.y, n.id);
                let inst = this.nodes[n.id];
                if (!inst) return;

                // Merge saved params, keeping defaults for any missing keys
                if (n.params) {
                    Object.keys(n.params).forEach(key => {
                        inst.params[key] = n.params[key];
                    });
                }

                // Also fix onchange handlers
                inst.el.querySelectorAll('.ne-node-params input[data-param], .ne-node-params select[data-param]').forEach(inp => {
                    const pName = inp.dataset.param;
                    inp.value = inst.params[pName] !== undefined ? inst.params[pName] : '';
                    inp.setAttribute('onchange', `window.nodeEditor.updateParam('${n.id}', '${pName}', this.value)`);
                });

                let num = parseInt(n.id.replace('n', ''));
                if (num > maxId) maxId = num;
            });
            this.idCounter = maxId + 1;

            data.connections.forEach(c => {
                // Only add connection if both nodes exist
                if (this.nodes[c.fromNode] && this.nodes[c.toNode]) {
                    this.addConnection(c.fromNode, c.fromPort, c.toNode, c.toPort);
                }
            });

            // Connections use getBoundingClientRect which needs layout to complete.
            // Defer path recalculation until browser has rendered the nodes.
            setTimeout(() => {
                this.connections.forEach(c => this.updateConnectionPath(c));
                this.updateMinimap();
            }, 500);

        } catch (e) {
            console.error(e);
            alert("Error loading pipeline: " + e.message);
        }
    }
}

// --- GLOBAL EXPOSURE & UI BINDING ---

window.openNodeEditor = function () {
    let mod = document.getElementById('nodeEditorModal');
    if (!mod.querySelector('.ne-canvas')) {
        // Build DOM structure
        mod.innerHTML = `
            <div class="ne-toolbar">
                <div class="ne-toolbar-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"></rect><line x1="6" y1="12" x2="18" y2="12"></line><line x1="12" y1="6" x2="12" y2="18"></line></svg> Node Pipeline Editor</div>
                <div class="divider"></div>
                <button class="ne-toolbar-btn ne-run-btn" onclick="window.nodeEditor.run()">▶ Run Pipeline</button>
                <div class="divider"></div>
                <button class="ne-toolbar-btn" onclick="window.nodeEditor.clear();">🗑 Clear</button>
                <button class="ne-toolbar-btn" onclick="window.nodeEditor.fitView();" title="Fit all nodes in view">⊞ Fit</button>
                <button class="ne-toolbar-btn" onclick="window.nodeEditor.exportPipeline()">⬇ Export</button>
                <button class="ne-toolbar-btn" onclick="window.nodeEditor.importPipeline()">⬆ Import</button>
                <button class="ne-toolbar-close ne-toolbar-btn" onclick="document.getElementById('nodeEditorModal').classList.remove('active')">✕ Close</button>
            </div>
            <div class="ne-body">
                <div class="ne-palette">
                    <div class="ne-palette-search"><input type="text" placeholder="Search nodes..."></div>
                    <div class="ne-palette-list"></div>
                </div>
                <div class="ne-canvas-wrap">
                    <div class="ne-canvas">
                        <svg class="ne-svg-layer" overflow="visible"></svg>
                    </div>
                    <div class="ne-minimap"></div>
                    <div class="ne-zoom-info"><span class="ne-zoom-pct">100%</span> <button onclick="window.nodeEditor.scale=1;window.nodeEditor.offsetX=0;window.nodeEditor.offsetY=0;window.nodeEditor.updateTransform();window.nodeEditor.updateMinimap();">1:1</button></div>
                </div>
            </div>
        `;
        window.nodeEditor = new NodeEditor('nodeEditorModal');
    }
    mod.classList.add('active');
    // Update minimap after visible
    requestAnimationFrame(() => {
        if (window.nodeEditor) window.nodeEditor.updateMinimap();
    });
};
