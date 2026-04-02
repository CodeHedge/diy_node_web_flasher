import { loadManifest, getDeviceFiles, getManifestVersion, getAllDevices, setProduct, getProduct, getDeviceOffsets, getDeviceVersion, loadOldVersions, getOldVersionsList, getOldVersionDeviceFiles } from './variables.js';

let espStub;
let isConnected = false;

const baudRates = 115200;

const bufferSize = 512;
const colors = ["#00a7e9", "#f89521", "#be1e2d"];
const measurementPeriodId = "0001";

const maxLogLength = 100;
const log = document.getElementById("log");
const butConnect = document.getElementById("butConnect");
const butClear = document.getElementById("butClear");
const butErase = document.getElementById("butErase");
const butProgram = document.getElementById("butProgram");
const autoscroll = document.getElementById("autoscroll");
const lightSS = document.getElementById("light");
const darkSS = document.getElementById("dark");
const darkMode = document.getElementById("darkmode");
const modelSelect = document.getElementById("modelSelect");
const versionSelect = document.getElementById("versionSelect");
//const variantSelect = document.getElementById("variantSelect");
const offsets = [0x1000, 0x8000, 0xE000, 0x10000];
const offsets2 = [0x0, 0x8000, 0xE000, 0x10000];

const appDiv = document.getElementById("app");

const productConfig = {
    biscuit: {
        title: 'Biscuit WebFlasher',
        logo: 'assets/logo_biscuit.png',
        footerText: 'Biscuit Firmware',
        footerLink: 'https://github.com/CodeHedge/Biscuit',
        footerLinkText: 'Biscuit',
        headerGradient: 'linear-gradient(135deg, #e67e22, #f39c12)'
    },
    marauder: {
        title: 'CYM WebFlasher',
        logo: 'assets/logo2.png',
        footerText: 'powered by Adafruit WebSerial ESPTool',
        footerLink: 'https://github.com/CodeHedge/ESP32-Marauder-Cheap-Yellow-Display',
        footerLinkText: 'Cheap-Yellow-Marauder',
        headerGradient: 'linear-gradient(135deg, #5c6bc0, #ff6b6b)'
    }
};

function initializeProduct(product) {
    const config = productConfig[product];
    if (!config) return;

    // Set product in variables module
    setProduct(product);

    // Update page title
    document.title = config.title;

    // Update header gradient
    const mainHeader = document.getElementById('mainHeader');
    if (mainHeader) {
        mainHeader.style.background = config.headerGradient;
        mainHeader.style.borderBottom = '5px solid rgba(255,255,255,0.2)';
    }

    // Update footer
    const footerRepoLink = document.getElementById('footerRepoLink');
    const footerPoweredText = document.getElementById('footerPoweredText');
    if (product === 'biscuit') {
        if (footerRepoLink) {
            footerRepoLink.href = 'https://patreon.com/therealhedge';
            footerRepoLink.textContent = 'Support on Patreon';
            footerRepoLink.style.display = '';
        }
        if (footerPoweredText) footerPoweredText.innerHTML = config.footerText;
    } else {
        if (footerRepoLink) {
            footerRepoLink.style.display = '';
            footerRepoLink.href = config.footerLink;
            footerRepoLink.textContent = config.footerLinkText;
        }
        if (footerPoweredText) {
            footerPoweredText.innerHTML = 'powered by <a href="https://github.com/CodeHedge/Adafruit_WebSerial_ESPTool">Adafruit WebSerial ESPTool</a>';
        }
    }

    // Hide product selector
    const selector = document.getElementById('productSelector');
    if (selector) selector.classList.add('hidden');

    // Save selection
    localStorage.setItem('selectedProduct', product);

    // Load manifest and populate UI
    initializeFromManifest().catch((error) => {
        console.error('Failed to initialize from manifest:', error);
        errorMsg(`Failed to load device configuration: ${error.message}`);
    });
}

document.getElementById('butConnect').addEventListener('click', function() {
    var icon = this.querySelector('i');
    if (icon.classList.contains('green-icon')) {
        icon.classList.remove('green-icon');
    } else {
        icon.classList.add('green-icon');
    }
});



document.addEventListener("DOMContentLoaded", () => {
    butConnect.addEventListener("click", () => {
        clickConnect().catch(async (e) => {
            console.error(e);
            errorMsg(e.message || e);
            if (espStub) {
                await espStub.disconnect();
            }
            toggleUIConnected(false);
        });
    });
    butClear.addEventListener("click", clickClear);
    butErase.addEventListener("click", clickErase);
    butProgram.addEventListener("click", clickProgram);
    butClear.addEventListener("click", clickClear);
    autoscroll.addEventListener("click", clickAutoscroll);
    //darkMode.addEventListener("click", clickDarkMode);
    window.addEventListener("error", function (event) {
        console.log("Got an uncaught error: ", event.error);
    });

    const notSupported = document.getElementById("notSupported");
    if (notSupported) {
        if ("serial" in navigator) {
            notSupported.classList.add("hidden");
        } else {
            notSupported.classList.remove("hidden");
        }
    }

    modelSelect.addEventListener("change", () => {
        const selectedModel = modelSelect.value;
        // Update version display for per-device versions (Biscuit mode)
        const deviceVersion = getDeviceVersion(selectedModel);
        if (deviceVersion) {
            const versionElement = document.getElementById('versionDisplay');
            if (versionElement) {
                versionElement.innerHTML = `<b>v${deviceVersion}</b>`;
            }
        }
    });


    versionSelect.addEventListener("change", () => {
        const selectedVersion = versionSelect.value;
        const product = getProduct();
        if (product === 'marauder') {
            const versionElement = document.getElementById('versionDisplay');
            if (versionElement) {
                if (selectedVersion === 'latest') {
                    const version = getManifestVersion();
                    versionElement.innerHTML = `<b>v${version}</b>`;
                } else if (selectedVersion.startsWith('old:')) {
                    versionElement.innerHTML = `<b>v${selectedVersion.substring(4)}</b>`;
                }
            }
        }
    });

    modelSelect.addEventListener("change", checkDropdowns);
    versionSelect.addEventListener("change", checkDropdowns);

    function checkDropdowns() {
        const isAnyDropdownNull = [modelSelect.value, versionSelect.value].includes("NULL");

        if (isAnyDropdownNull) {
            butProgram.disabled = true;
        } else {
            butProgram.disabled = false;
        }
    }

    modelSelect.addEventListener('change', checkDropdowns);


    checkDropdowns();

    // Product selector: check URL param or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlProduct = urlParams.get('product');
    const savedProduct = localStorage.getItem('selectedProduct');

    // Wire up product card click handlers
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const product = card.getAttribute('data-product');
            initializeProduct(product);
        });
    });

    // Wire up "Switch Device" link
    const switchLink = document.getElementById('switchProduct');
    if (switchLink) {
        switchLink.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('selectedProduct');
            const selector = document.getElementById('productSelector');
            if (selector) selector.classList.remove('hidden');
        });
    }

    if (urlProduct && productConfig[urlProduct]) {
        initializeProduct(urlProduct);
    } else if (savedProduct && productConfig[savedProduct]) {
        initializeProduct(savedProduct);
    } else {
        // Show product selector modal
        const selector = document.getElementById('productSelector');
        if (selector) selector.classList.remove('hidden');
    }

    logMsg("ESP Web Flasher loaded.");
});

function logMsg(text) {
    log.innerHTML += text + "<br>";

    if (log.textContent.split("\n").length > maxLogLength + 1) {
        let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
        log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
    }


    log.scrollTop = log.scrollHeight;

}


function annMsg(text) {
    log.innerHTML += `<font color='#FF9999'>` + text + `<br></font>`;

    if (log.textContent.split("\n").length > maxLogLength + 1) {
        let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
        log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
    }

    log.scrollTop = log.scrollHeight;

}
function compMsg(text) {
    log.innerHTML += `<font color='#2ED832'>` + text + `<br></font>`;

    if (log.textContent.split("\n").length > maxLogLength + 1) {
        let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
        log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
    }

    log.scrollTop = log.scrollHeight;

}
function initMsg(text) {
    log.innerHTML += `<font color='#F72408'>` + text + `<br></font>`;

    if (log.textContent.split("\n").length > maxLogLength + 1) {
        let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
        log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
    }

        log.scrollTop = log.scrollHeight;

}

function debugMsg(...args) {
    function getStackTrace() {
        let stack = new Error().stack;
        stack = stack.split("\n").map((v) => v.trim());
        stack.shift();
        stack.shift();

        let trace = [];
        for (let line of stack) {
            line = line.replace("at ", "");
            trace.push({
                func: line.substr(0, line.indexOf("(") - 1),
                pos: line.substring(line.indexOf(".js:") + 4, line.lastIndexOf(":")),
            });
        }

        return trace;
    }

    let stack = getStackTrace();
    stack.shift();
    let top = stack.shift();
    let prefix =
        '<span class="debug-function">[' + top.func + ":" + top.pos + "]</span> ";
    for (let arg of args) {
        if (typeof arg == "string") {
            logMsg(prefix + arg);
        } else if (typeof arg == "number") {
            logMsg(prefix + arg);
        } else if (typeof arg == "boolean") {
            logMsg(prefix + (arg ? "true" : "false"));
        } else if (Array.isArray(arg)) {
            logMsg(prefix + "[" + arg.map((value) => toHex(value)).join(", ") + "]");
        } else if (typeof arg == "object" && arg instanceof Uint8Array) {
            logMsg(
                prefix +
                "[" +
                Array.from(arg)
                    .map((value) => toHex(value))
                    .join(", ") +
                "]"
            );
        } else {
            logMsg(prefix + "Unhandled type of argument:" + typeof arg);
            console.log(arg);
        }
        prefix = "";
    }
}

function errorMsg(text) {
    logMsg('<span class="error-message">Error:</span> ' + text);
    console.log(text);
}

function enableStyleSheet(node, enabled) {
    node.disabled = !enabled;
}

function formatMacAddr(macAddr) {
    return macAddr
        .map((value) => value.toString(16).toUpperCase().padStart(2, "0"))
        .join(":");
}

function updateTheme() {
  // Disable all themes
  document
    .querySelectorAll("link[rel=stylesheet].alternate")
    .forEach((styleSheet) => {
      enableStyleSheet(styleSheet, false);
    });

  if (darkMode.checked) {
    enableStyleSheet(darkSS, true);
  } else {
    enableStyleSheet(lightSS, true);
  }
}

async function clickAutoscroll() {
  saveSetting("autoscroll", autoscroll.checked);
}

async function clickConnect() {
    if (espStub) {
        await espStub.disconnect();
        await espStub.port.close();
        toggleUIConnected(false);
        espStub = undefined;
        return;
    }

    const esploaderMod = await window.esptoolPackage;
    const esploader = await esploaderMod.connect({
        log: logMsg,
        debug: debugMsg,
        error: errorMsg
    });

    try {
        await esploader.initialize();
        logMsg(`Connected to ${esploader.chipName} @ ${baudRates} bps`);
        logMsg(`MAC Address: ${formatMacAddr(esploader.macAddr())}`);

        espStub = await esploader.runStub();
        toggleUIConnected(true);
        toggleUIToolbar(true);

        espStub.addEventListener("disconnect", () => {
            toggleUIConnected(false);
            espStub = undefined;
        });
    } catch (err) {
        console.error('Initialization error:', err);
        await esploader.disconnect();
        throw err; // Re-throw the error to handle it elsewhere if needed
    }
}



async function changeBaudRate() {
    saveSetting("baudrate", baudRate.value);
    if (espStub) {
        let baud = parseInt(baudRate.value);
        if (baudRates.includes(baud)) {
            await espStub.setBaudrate(baud);
        }
    }
}


function createProgressBarDialog() {
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = `
        @keyframes blink {
            50% { opacity: 0; }
        }
        .blinking-text {
            animation: blink 1s linear infinite;
        }
    `;
    document.head.appendChild(styleSheet);

    const progressBarDialog = document.createElement("div");
    progressBarDialog.id = "progressBarDialog";
    progressBarDialog.style.position = "fixed";
    progressBarDialog.style.left = "50%";
    progressBarDialog.style.top = "50%";
    progressBarDialog.style.transform = "translate(-50%, -50%)";
    progressBarDialog.style.padding = "40px";
    progressBarDialog.style.backgroundColor = "#333333";
    progressBarDialog.style.border = "2px solid #6272a4";
    progressBarDialog.style.borderRadius = "10px";
    progressBarDialog.style.color = "white";
    progressBarDialog.style.zIndex = "1000";
    progressBarDialog.style.fontSize = "1.5em";
    progressBarDialog.style.maxWidth = "350px"; // Set a maximum width for the dialog
    progressBarDialog.style.width = "50%";
    progressBarDialog.style.boxSizing = "border-box"; // Include padding in width calculation
    progressBarDialog.style.overflow = "hidden"; // Prevent content from spilling out
    progressBarDialog.innerHTML = `
        <div class="blinking-text" style="margin-bottom: 10px; color: #f8f8f2; animation: blink-animation 1.5s steps(2, start) infinite;">Flashing...</div>
<style>
  @keyframes blink-animation {
    to {
        visibility: hidden;
    }
}
</style>
<div id="progressBar" style="width: 100%; background-color: #44475a; border: 1px solid #e0e0e0; border-radius: 4px;">
    <div id="progress" style="width: 0%; height: 20px; background-color: #6272a4; border-radius: 4px; transition: width 0.5s ease;"></div>
</div>
<div style="margin-top: 10px; color: #FF9999; font-style: italic; font-size: 16px;">Flashing process will take at least 2 minutes.</div>
    `;

    document.body.appendChild(progressBarDialog);
    return progressBarDialog;
}


async function clickDarkMode() {
  updateTheme();
  saveSetting("darkmode", darkMode.checked);
}


async function clickErase() {
    initMsg(` `);
    initMsg(` !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! `);
    initMsg(` !!! &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; CAUTION!!! &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; !!! `);
    initMsg(` !!! &nbsp;&nbsp;THIS WILL ERASE THE FIRMWARE ON&nbsp; !!! `);
    initMsg(` !!! &nbsp;&nbsp;&nbsp;YOUR DEVICE! THIS CAN NOT BE &nbsp;&nbsp; !!! `);
    initMsg(` !!! &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; UNDONE! &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; !!! `);
    initMsg(` !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! `);
    initMsg(` `);
    if (window.confirm("This will erase the entire flash. Click OK to continue.")) {
        butErase.disabled = true;
        butProgram.disabled = true;
        try {
            logMsg("Erasing flash memory. Please wait...");
            let stamp = Date.now();
            await espStub.eraseFlash();
            logMsg(`Finished. Took <font color="yellow">` + (Date.now() - stamp) + `ms</font> to erase.`);
            compMsg(" ");
            compMsg(" ---> ERASING PROCESS COMPLETED!");
            compMsg(" ");
        } catch (e) {
            errorMsg(e);
        } finally {

            butProgram.disabled = false;
        }
    }
}

async function clickProgram() {
    const readUploadedFileAsArrayBuffer = (inputFile) => {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onerror = () => {
                reader.abort();
                reject(new DOMException("Problem parsing input file."));
            };
            reader.onload = () => {
                resolve(reader.result);
            };
            reader.readAsArrayBuffer(inputFile);
        });
    };

    const selectedModel = modelSelect.value;
    const selectedVersion = versionSelect.value;
    const progressBarDialog = createProgressBarDialog();
    const progress = document.getElementById("progress");

    // Ensure manifest is loaded
    try {
        await loadManifest();
    } catch (error) {
        errorMsg(`Failed to load manifest: ${error.message}`);
        return;
    }

    let selectedFiles;
    if (selectedVersion === "latest") {
        selectedFiles = getDeviceFiles(selectedModel);
        if (!selectedFiles) {
            errorMsg(`No files found for model: ${selectedModel}`);
            return;
        }
    } else if (selectedVersion.startsWith("old:")) {
        const oldVersion = selectedVersion.substring(4);
        selectedFiles = getOldVersionDeviceFiles(oldVersion, selectedModel);
        if (!selectedFiles) {
            errorMsg(`No files found for model ${selectedModel} in version ${oldVersion}`);
            return;
        }
    } else {
        errorMsg(`Unsupported version: ${selectedVersion}`);
        return;
    }

    const flashMessages = document.getElementById("flashMessages");
    // Disable buttons during flashing
    butErase.disabled = true;
    butProgram.disabled = true;

    // Prepare user feedback messages
    initMsg(` `);
    initMsg(` !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! `);
    initMsg(` !!!   FLASHING STARTED! DO NOT UNPLUG   !!! `);
    initMsg(` !!!    UNTIL FLASHING IS COMPLETE!!    !!! `);
    initMsg(` !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! `);
    initMsg(` `);
    flashMessages.innerHTML = "";

    // Calculate total size of all files to flash for progress tracking
    let totalSize = 0;
    let flashedSize = 0;
    let fileTypes;
    // CYD2USB only has these three files
    fileTypes = ['bootloader', 'partitions', 'firmware'];
    for (let fileType of fileTypes) {
        let fileResource = selectedFiles[fileType];
        let response = await fetch(fileResource, { method: 'HEAD' });
        let fileSize = response.headers.get('content-length');
        if (fileSize) {
            totalSize += parseInt(fileSize, 10);
        } else {
            console.error(`Failed to get size for file type: ${fileType}`);
        }
    }

    // Function to update the progress bar UI
    const updateProgressBar = (cumulativeFlashedSize) => {
        if (cumulativeFlashedSize > totalSize) {
            console.error(`Cumulative flashed size exceeds total size: ${cumulativeFlashedSize} / ${totalSize}`);
        } else {
            flashedSize = cumulativeFlashedSize;
        }
        const progressPercentage = Math.min((flashedSize / totalSize) * 100, 100);
        const progressBar = document.getElementById("progress");
        if (progressBar) {
            progressBar.style.width = `${progressPercentage}%`;
        }
    };

    const offsetsMap = {
        "SYD": [0x0, 0x8000, 0xE000, 0x10000],
        "CYD": [0x1000, 0x8000, 0x10000],
        "CYDNOGPS": [0x1000, 0x8000, 0x10000],
        "CYD2USB_INVERT_OFF": [0x1000, 0x8000, 0x10000],
        "CYD2USB_INVERT_ON": [0x1000, 0x8000, 0x10000],
        "CYD2USB_V21_INVERT_OFF": [0x1000, 0x8000, 0x10000],
        "CYD2USBNOGPS": [0x1000, 0x8000, 0x10000],
        "CYD24GPS": [0x1000, 0x8000, 0x10000],
        "CYD24NOGPS": [0x1000, 0x8000, 0x10000],
        "CYD24GGPS": [0x1000, 0x8000, 0x10000],
        "CYD24GNOGPS": [0x1000, 0x8000, 0x10000],
        "CYD24CAPGPS": [0x1000, 0x8000, 0x10000],
        "CYD24CAPNOGPS": [0x1000, 0x8000, 0x10000],
        "CYD35GPS": [0x1000, 0x8000, 0x10000],
        "CYD35NOGPS": [0x1000, 0x8000, 0x10000],
        "CYD35CAPGPS": [0x1000, 0x8000, 0x10000],
        "CYD35CAPNOGPS": [0x1000, 0x8000, 0x10000],
        "CYD32GPS": [0x1000, 0x8000, 0x10000],
        "CYD32NOGPS": [0x1000, 0x8000, 0x10000],
        "CYD32CAPGPS": [0x1000, 0x8000, 0x10000],
        "CYD32CAPNOGPS": [0x1000, 0x8000, 0x10000]
    };

    // Resolve offsets: try manifest first (Biscuit), fall back to offsetsMap (Marauder)
    let deviceOffsets = getDeviceOffsets(selectedModel);
    if (!deviceOffsets) {
        deviceOffsets = offsetsMap[selectedModel];
    }
    if (!deviceOffsets) {
        errorMsg(`No offset mapping found for model: ${selectedModel}`);
        progressBarDialog.remove();
        butErase.disabled = false;
        butProgram.disabled = false;
        return;
    }

    // Flash each file in sequence at the specified offsets
    for (let fileType of fileTypes) {
        let fileResource = selectedFiles[fileType];
        let offset = deviceOffsets[fileTypes.indexOf(fileType)];
        try {
            // Fetch the binary data for the file
            let binFile = new File([await fetch(fileResource).then(r => r.blob())], fileType + ".bin");
            let contents = await readUploadedFileAsArrayBuffer(binFile);

            // Flash the binary data to the device at the given offset
            await espStub.flashData(
                contents,
                (cumulativeFlashedSize) => updateProgressBar(cumulativeFlashedSize),
                offset
            );

            // Update progress to full for this file and announce completion
            updateProgressBar(totalSize);
            annMsg(` ---> Finished flashing ${fileType}.`);
            annMsg(` `);
            await sleep(100);
        } catch (e) {
            errorMsg(e);
        }
    }

    // Close the progress dialog and re-enable buttons after flashing all files
    progressBarDialog.remove();
    butErase.disabled = false;
    butProgram.disabled = false;
    flashMessages.style.display = "none";
    compMsg(" ---> FLASHING PROCESS COMPLETED!");
    compMsg(" ");
    logMsg("Restart the board or disconnect to use the device.");
}

async function clickClear() {
    log.innerHTML = "";
}

function convertJSON(chunk) {
    try {
        let jsonObj = JSON.parse(chunk);
        return jsonObj;
    } catch (e) {
        return chunk;
    }
}

function toggleUIToolbar(show) {
    isConnected = show;
    if (show) {
        appDiv.classList.add("connected");
    } else {
        appDiv.classList.remove("connected");
    }
    butErase.disabled = !show;
}

function toggleUIConnected(connected) {
    let label = "Connect";
    let iconClass = "fas fa-plug"; // Default icon for "Connect"
    let iconHtml = `<i class="${iconClass}"></i>`;

    if (connected) {
        label = "Disconnect";
        iconClass = "far fa-window-close red-icon"; // Change icon for "Disconnect" and apply red color
        iconHtml = `<i class="${iconClass}"></i>`; // Redefine the icon HTML with the red class
    } else {
        toggleUIToolbar(false);
    }

    // Update the button's HTML with the new icon and label
    document.getElementById('butConnect').innerHTML = `${iconHtml} ${label}`;
}

function loadSetting(setting, defaultValue) {
    let value = JSON.parse(window.localStorage.getItem(setting));
    if (value == null) {
        return defaultValue;
    }

    return value;
}

function saveSetting(setting, value) {
    window.localStorage.setItem(setting, JSON.stringify(value));
}

function ucWords(text) {
    return text
        .replace("_", " ")
        .toLowerCase()
        .replace(/(?<= )[^\s]|^./g, (a) => a.toUpperCase());
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize the UI from the manifest
 */
async function initializeFromManifest() {
    try {
        await loadManifest();

        // Load old versions in parallel (Marauder only, non-blocking)
        await loadOldVersions();

        // Update version display
        updateVersionDisplay();

        // Populate device dropdown
        populateDeviceDropdown();

        // Update version dropdown
        updateVersionDropdown();
    } catch (error) {
        console.error('Error initializing from manifest:', error);
        throw error;
    }
}

/**
 * Populate the device dropdown from manifest
 */
function populateDeviceDropdown() {
    const devices = getAllDevices();
    if (devices.length === 0) {
        console.warn('No devices found in manifest');
        return;
    }

    // Clear existing options (except the first NULL option)
    const modelSelect = document.getElementById("modelSelect");
    modelSelect.innerHTML = '<option value="NULL" disabled selected style="display:none;"><b>--- SELECT BOARD ---</b></option>';

    // Group devices by their group property
    const groupedDevices = {};
    devices.forEach(device => {
        if (!groupedDevices[device.group]) {
            groupedDevices[device.group] = [];
        }
        groupedDevices[device.group].push(device);
    });

    // Create optgroups and options
    Object.keys(groupedDevices).forEach(groupName => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `+ ${groupName}`;

        groupedDevices[groupName].forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `- ${device.name}`;
            optgroup.appendChild(option);
        });

        modelSelect.appendChild(optgroup);
    });
}

/**
 * Update version display in header
 */
function updateVersionDisplay() {
    const product = getProduct();
    const versionElement = document.getElementById('versionDisplay');
    if (!versionElement) return;

    if (product === 'biscuit') {
        // Biscuit devices have per-device versions; show prompt until one is selected
        versionElement.innerHTML = `<b>Select a board</b>`;
    } else {
        const version = getManifestVersion();
        if (version) {
            versionElement.innerHTML = `<b>v${version}</b>`;
        } else {
            versionElement.innerHTML = `<b>Unknown</b>`;
        }
    }
}

/**
 * Update version dropdown
 */
function updateVersionDropdown() {
    const product = getProduct();
    const version = getManifestVersion();
    const versionSelect = document.getElementById("versionSelect");

    // Clear existing options (except the first NULL option)
    versionSelect.innerHTML = '<option value="NULL" disabled selected style="display:none;"><b>--- VERSION ---</b></option>';

    // Add latest version option
    if (product === 'biscuit') {
        // For Biscuit, just show "Current" since versions are per-device
        const option = document.createElement('option');
        option.value = 'latest';
        option.textContent = 'Current';
        versionSelect.appendChild(option);
    } else if (version) {
        const option = document.createElement('option');
        option.value = 'latest';
        option.textContent = `v${version} (Current)`;
        versionSelect.appendChild(option);
    } else {
        const option = document.createElement('option');
        option.value = 'latest';
        option.textContent = 'Current (latest)';
        versionSelect.appendChild(option);
    }

    // Add old versions for Marauder
    if (product === 'marauder') {
        const oldVersions = getOldVersionsList();
        if (oldVersions.length > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '── Previous Versions ──';
            versionSelect.appendChild(separator);

            oldVersions.forEach(v => {
                const option = document.createElement('option');
                option.value = 'old:' + v.version;
                option.textContent = `v${v.version}`;
                versionSelect.appendChild(option);
            });
        }
    }
}
