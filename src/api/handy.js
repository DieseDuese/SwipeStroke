const API_BASE = 'https://www.handyfeeling.com/api/handy/v2';

/**
 * Checks if the device is connected.
 * @param {string} connectionKey The connection key to the Handy
 * @returns {Promise<boolean>} True if connected, false otherwise
 */
export async function checkConnection(connectionKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

    try {
        const response = await fetch(`${API_BASE}/connected?_t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Connection-Key': connectionKey
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) return false;
        const data = await response.json();
        return data.connected === true;
    } catch (err) {
        clearTimeout(timeoutId);
        // An abort error or network error means the connection check failed
        console.error("Connection check failed or timed out:", err.name);
        return false;
    }
}

/**
 * Set the device mode to HAMP (Handy Audio-Motor Protocol), which is mode 2.
 * HAMP is required to set slide and velocity independently for looping patterns.
 * Mode: HAMP(0), HSSP(1), HDSP(2), MAINTENANCE(3), HBSP(4) -> Wait, the API says: 
 * "HAMP(0)" in one place, but "HAMP mode is enabled (mode=2)" in another.
 * Let's set it to HAMP by its enum or string if required, but the API doc typically uses integers or endpoints natively.
 * Actually, v2 API has `/mode` endpoint.
 * Let's properly use the V2 `/mode` endpoint.
 */
export async function setMode(connectionKey, mode = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(`${API_BASE}/mode`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Connection-Key': connectionKey
            },
            body: JSON.stringify({ mode }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Set mode failed:", err.name);
        return false;
    }
}

/**
 * Start HAMP motion. HAMP state 2 means moving.
 */
export async function startHampMotion(connectionKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(`${API_BASE}/hamp/start`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'X-Connection-Key': connectionKey
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Start HAMP motion failed:", err.name);
        return false;
    }
}

/**
 * Stop HAMP motion.
 */
export async function stopHampMotion(connectionKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(`${API_BASE}/hamp/stop`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'X-Connection-Key': connectionKey
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Stop HAMP motion failed:", err.name);
        return false;
    }
}

/**
 * Set the bounding box (slide) of the Handy.
 * @param {number} min 0-100%
 * @param {number} max 0-100%
 */
export async function setSlide(connectionKey, min, max) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(`${API_BASE}/slide`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Connection-Key': connectionKey
            },
            body: JSON.stringify({ min, max }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Set slide failed:", err.name);
        return false;
    }
}

/**
 * Set the velocity in HAMP mode.
 * @param {number} velocity 0-100%
 */
export async function setHampVelocity(connectionKey, velocity) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(`${API_BASE}/hamp/velocity`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Connection-Key': connectionKey
            },
            body: JSON.stringify({ velocity }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Set HAMP velocity failed:", err.name);
        return false;
    }
}
