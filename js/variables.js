// Manifest-based device configuration
let manifestData = null;
let manifestLoadPromise = null;
let currentProduct = null;
let manifestPath = null;

// Old versions data (Marauder only)
let oldVersionsData = null;
let oldVersionsLoadPromise = null;

/**
 * Set the active product and configure manifest path
 * @param {string} product - 'biscuit' or 'marauder'
 */
export function setProduct(product) {
    currentProduct = product;
    // Reset cached manifest when switching products
    manifestData = null;
    manifestLoadPromise = null;
    oldVersionsData = null;
    oldVersionsLoadPromise = null;

    if (product === 'biscuit') {
        manifestPath = 'resources/BISCUIT/CURRENT/manifest.json';
    } else {
        manifestPath = 'resources/CURRENT/manifest.json';
    }
}

/**
 * Get the current product
 * @returns {string|null}
 */
export function getProduct() {
    return currentProduct;
}

/**
 * Load the manifest.json file
 * Caches the result after first load
 */
export async function loadManifest() {
    if (manifestData) {
        return manifestData;
    }

    if (manifestLoadPromise) {
        return manifestLoadPromise;
    }

    const url = (manifestPath || 'resources/CURRENT/manifest.json') + '?t=' + Date.now();

    manifestLoadPromise = (async () => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load manifest: ${response.status} ${response.statusText}`);
            }
            manifestData = await response.json();
            return manifestData;
        } catch (error) {
            console.error('Error loading manifest:', error);
            throw error;
        }
    })();

    return manifestLoadPromise;
}

/**
 * Get file paths for a specific device from the manifest
 * @param {string} deviceId - The device ID
 * @returns {Object|null} Object with bootloader, partitions, and firmware paths, or null if not found
 */
export function getDeviceFiles(deviceId) {
    if (!manifestData) {
        console.error('Manifest not loaded. Call loadManifest() first.');
        return null;
    }

    const device = manifestData.devices.find(d => d.id === deviceId);
    if (!device) {
        console.error(`Device not found in manifest: ${deviceId}`);
        return null;
    }

    return device.files;
}

/**
 * Get the version from the manifest (top-level for Marauder)
 * @returns {string|null} Version string or null if manifest not loaded
 */
export function getManifestVersion() {
    if (!manifestData) {
        return null;
    }
    return manifestData.version || null;
}

/**
 * Get all devices from the manifest
 * @returns {Array} Array of device objects
 */
export function getAllDevices() {
    if (!manifestData) {
        return [];
    }
    return manifestData.devices;
}

/**
 * Get flash offsets for a specific device from the manifest
 * @param {string} deviceId - The device ID
 * @returns {Array|null} Array of offsets, or null if not found
 */
export function getDeviceOffsets(deviceId) {
    if (!manifestData) {
        return null;
    }
    const device = manifestData.devices.find(d => d.id === deviceId);
    if (!device || !device.offsets) {
        return null;
    }
    return device.offsets;
}

/**
 * Get version for a specific device from the manifest
 * @param {string} deviceId - The device ID
 * @returns {string|null} Version string, or null if not found
 */
export function getDeviceVersion(deviceId) {
    if (!manifestData) {
        return null;
    }
    const device = manifestData.devices.find(d => d.id === deviceId);
    if (!device || !device.version) {
        return null;
    }
    return device.version;
}

/**
 * Load old firmware versions (Marauder only)
 * @returns {Object|null} Old versions data or null if not applicable
 */
export async function loadOldVersions() {
    if (currentProduct !== 'marauder') {
        return null;
    }

    if (oldVersionsData) {
        return oldVersionsData;
    }

    if (oldVersionsLoadPromise) {
        return oldVersionsLoadPromise;
    }

    const url = 'resources/marauder_versions.json?t=' + Date.now();

    oldVersionsLoadPromise = (async () => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load old versions: ${response.status} ${response.statusText}`);
            }
            oldVersionsData = await response.json();
            return oldVersionsData;
        } catch (error) {
            console.error('Error loading old versions:', error);
            return null;
        }
    })();

    return oldVersionsLoadPromise;
}

/**
 * Get list of old versions available
 * @returns {Array} Array of {version, date} objects
 */
export function getOldVersionsList() {
    if (!oldVersionsData || !oldVersionsData.versions) {
        return [];
    }
    return oldVersionsData.versions.map(v => ({ version: v.version, date: v.date }));
}

/**
 * Get device files for a specific old version
 * @param {string} version - Version string (e.g. "1.10.2")
 * @param {string} deviceId - Device ID
 * @returns {Object|null} File paths or null if not found
 */
export function getOldVersionDeviceFiles(version, deviceId) {
    if (!oldVersionsData || !oldVersionsData.versions) {
        return null;
    }
    const versionEntry = oldVersionsData.versions.find(v => v.version === version);
    if (!versionEntry) {
        return null;
    }
    const device = versionEntry.devices.find(d => d.id === deviceId);
    if (!device) {
        return null;
    }
    return device.files;
}
