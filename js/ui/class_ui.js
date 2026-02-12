// UI: Class UI Manager

function renderClassButtons() {
    const selector = document.getElementById("classSelect");
    if (!selector) return;

    selector.innerHTML = '';

    // Always add 'None' (Eraser) - ID 0
    let optNone = document.createElement("option");
    optNone.value = 0;
    optNone.textContent = "0. Eraser";
    if (state.currentLabelType === 0) optNone.selected = true;
    selector.appendChild(optNone);

    // Add dynamically registered classes
    Object.keys(state.labelTypes).forEach(key => {
        let id = parseInt(key);
        if (id === 0) return;

        let type = state.labelTypes[id];
        let opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `${id}. ${type.name}`;
        if (state.currentLabelType === id) opt.selected = true;

        // Inline styles for options (supported in some browsers)
        opt.style.color = type.color;
        opt.style.fontWeight = "bold";

        selector.appendChild(opt);
    });

    // Update select color to match selected option
    updateSelectColor(selector);
    selector.onchange = function () {
        setLabelType(parseInt(this.value));
        updateSelectColor(this);
    };
}

function updateSelectColor(select) {
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption) {
        select.style.color = selectedOption.style.color || 'var(--text-main)';
        select.style.fontWeight = selectedOption.style.fontWeight || 'normal';
    }
}

function setLabelType(typeId) {
    if (!state.labelTypes[typeId] && typeId !== 0) return;
    state.currentLabelType = typeId;
    // Sync Dropdown
    const selector = document.getElementById("classSelect");
    if (selector) {
        selector.value = state.currentLabelType;
        updateSelectColor(selector);
    }
}

function openClassManager() {
    if (window.openModal) window.openModal('classManagerModal');
    renderClassManagerList();
}

function renderClassManagerList() {
    const list = document.getElementById("classListContainer");
    if (!list) return;

    list.innerHTML = "";

    Object.keys(state.labelTypes).forEach(key => {
        let id = parseInt(key);
        if (id === 0) return; // Don't allow editing 'None'

        let type = state.labelTypes[id];

        let row = document.createElement("div");
        row.className = "class-row";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";
        row.style.marginBottom = "5px";

        let colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = type.color;
        colorInput.onchange = (e) => {
            state.labelTypes[id].color = e.target.value;
            renderClassButtons();
            if (window.draw) window.draw(true); // Redraw chart labels
            // renderClassManagerList? Not needed for color input itself
        };

        let nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = type.name;
        nameInput.className = "modal-input";
        nameInput.style.flex = "1";
        nameInput.onchange = (e) => {
            state.labelTypes[id].name = e.target.value;
            renderClassButtons();
        };

        let delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.className = "btn-icon";
        delBtn.style.color = "red";
        delBtn.onclick = () => {
            if (confirm(`Delete Class ${id} (${type.name})?`)) {
                if (window.deleteClass) window.deleteClass(id);
                renderClassManagerList();
            }
        };

        row.appendChild(document.createTextNode(`ID ${id}: `));
        row.appendChild(colorInput);
        row.appendChild(nameInput);
        row.appendChild(delBtn);

        list.appendChild(row);
    });

    // Populate the static conversion selectors
    populateConversionSelectors();
}

function populateConversionSelectors() {
    const fromSelect = document.getElementById("convertFromSelect");
    const toSelect = document.getElementById("convertToSelect");
    const btnConvert = document.getElementById("btnConvertLabels");

    if (!fromSelect || !toSelect || !btnConvert) {
        console.warn("Conversion UI elements not found");
        return;
    }

    // Clear existing
    fromSelect.innerHTML = "";
    toSelect.innerHTML = "";

    // Prepare options
    const classes = Object.keys(state.labelTypes).map(id => ({ id: parseInt(id), name: state.labelTypes[id].name }));
    classes.sort((a, b) => a.id - b.id);
    const allOptions = [{ id: 0, name: "Eraser (0)" }, ...classes];

    // Populate
    allOptions.forEach(cls => {
        let opt1 = document.createElement("option");
        opt1.value = cls.id;
        opt1.textContent = `${cls.id}: ${cls.name}`;
        fromSelect.appendChild(opt1);

        let opt2 = document.createElement("option");
        opt2.value = cls.id;
        opt2.textContent = `${cls.id}: ${cls.name}`;
        toSelect.appendChild(opt2);
    });

    // Bind Click
    btnConvert.onclick = () => {
        const fromId = parseInt(fromSelect.value);
        const toId = parseInt(toSelect.value);

        if (fromId === toId) {
            alert("Source and Target are the same.");
            return;
        }

        const fromName = fromSelect.options[fromSelect.selectedIndex].text;
        const toName = toSelect.options[toSelect.selectedIndex].text;

        if (confirm(`Convert all "${fromName}" to "${toName}"?`)) {
            if (window.convertLabels) {
                const count = window.convertLabels(fromId, toId);
                alert(`Converted ${count} points.`);
                renderClassManagerList();
            }
        }
    };
}

function addNewClass() {
    if (window.getNextAvailableClassId && window.registerClass) { // Logic in core/class_manager.js
        const newId = window.getNextAvailableClassId();
        window.registerClass(newId, `Class ${newId}`, window.getRandomColor ? window.getRandomColor() : '#888888');
        renderClassManagerList();
    }
}

// Expose globals
window.renderClassButtons = renderClassButtons;
window.setLabelType = setLabelType;
window.openClassManager = openClassManager;
window.addNewClass = addNewClass;
