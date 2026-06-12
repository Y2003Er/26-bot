import axios from 'axios';

// Updated Cobalt API v10
const COBALT_API = 'https://cobalt.tools/api/json';

// Fallback instances in case main is down
const COBALT_INSTANCES = [
    'https://cobalt.tools/api/json',
    'https://api.cobalt.tools/api/json',
    'https://cobalt.imput.net/api/json',
];

export async function cobaltDownload(url, isAudioOnly = false) {
    const body = {
        url,
        videoQuality: '720',
        audioFormat: 'mp3',
        filenameStyle: 'basic',
        ...(isAudioOnly && { downloadMode: 'audio' }),
    };

    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };

    let lastError;

    for (const instance of COBALT_INSTANCES) {
        try {
            const res = await axios.post(instance, body, {
                headers,
                timeout: 30000,
            });

            const { status, url: downloadUrl, tunnel } = res.data;

            // Cobalt v10 returns 'tunnel' or 'redirect'
            const finalUrl = downloadUrl || tunnel;

            if (finalUrl && ['tunnel', 'redirect', 'stream', 'picker'].includes(status)) {
                return finalUrl;
            }

            // Some instances return the url directly under different status
            if (finalUrl) return finalUrl;

            throw new Error(`Unexpected status: ${status}`);

        } catch (err) {
            lastError = err;
            console.error(`Cobalt instance failed (${instance}):`, err.message);
            continue;
        }
    }

    throw lastError || new Error('All Cobalt instances failed');
}