const axios = require('axios');
const https = require('https');

let proxyUrl = null;

// Handle proxy URL configuration
try {
    const SMARTUI_API_PROXY = process.env.SMARTUI_API_PROXY;
    if (SMARTUI_API_PROXY) {
        const urlStr = SMARTUI_API_PROXY.startsWith('http') ?
            SMARTUI_API_PROXY : `http://${SMARTUI_API_PROXY}`;
        proxyUrl = new URL(urlStr);
    }
} catch (error) {
    console.error('[smartui] Invalid proxy URL:', error.message);
}

const axiosConfig = {
    proxy: proxyUrl ? {
        host: proxyUrl.hostname,
        port: proxyUrl.port ? Number(proxyUrl.port) : 80,
        ...(proxyUrl.username && proxyUrl.password ? {
            auth: {
                username: proxyUrl.username,
                password: proxyUrl.password
            }
        } : {})
    } : false
};

// Handle certificate verification skip
if (process.env.SMARTUI_API_SKIP_CERTIFICATES) {
    axiosConfig.httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });
}

const httpClient = axios.create(axiosConfig);

module.exports = { httpClient };

