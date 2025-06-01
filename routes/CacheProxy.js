const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const https = require('https');
const os = require('os');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Bypass SSL

const responseCache = new Map();
const CACHE_EXPIRATION = 60 * 60 * 1000;

const blacklist = [
    "ezdekauti8338.xml", "dongoautis333.xml", "sigmabangget.xml",
    "mangeak9449.xml", "netrohtf99.xml", "gtps777.xml",
    "gtp2929.xml", "gtps3333.xml"
];

// Auto clear if memory > 80%
function checkMemoryUsage() {
    const used = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
    if (used > 80) {
        console.warn("Memory high, clearing cache.");
        responseCache.clear();
    }
}

// Clean expired cache
setInterval(() => {
    const now = Date.now();
    for (const [key, { expiry }] of responseCache.entries()) {
        if (now > expiry) responseCache.delete(key);
    }
}, 5 * 60 * 1000);

// Main route
router.get("/:ip/cache/*", async (req, res, next) => {
    const ip = req.params.ip;
    const fullUrl = req.originalUrl;
    const cacheKey = `${req.method}:${fullUrl}`;
    const force = req.query.force === 'true';
    const now = Date.now();

    if (!ip.match(/^\d{1,3}(\.\d{1,3}){3}$/)) return next();
    if (blacklist.some(entry => fullUrl.includes(entry))) {
        console.warn(`Blocked: ${fullUrl}`);
        return res.status(404).send("Blocked");
    }

    checkMemoryUsage();

    const cached = responseCache.get(cacheKey);
    if (!force && cached && now < cached.expiry) {
        console.log(`Cache HIT: ${cacheKey}`);
        res.writeHead(cached.status, {
            ...cached.headers,
            'X-Cache': 'HIT'
        });
        return res.end("Cached (headers only).");
    }

    delete req.headers["content-length"];
    delete req.headers["transfer-encoding"];
    req.headers.host = "www.growtopia1.com";

    const agent = new https.Agent({ rejectUnauthorized: false });

    const options = {
        method: req.method,
        headers: req.headers,
        agent: agent
    };

    try {
        const targetUrl = 'https:/' + fullUrl;
        const start = Date.now();
        const response = await fetch(targetUrl, options);
        const duration = Date.now() - start;
        console.log(`Fetched ${targetUrl} in ${duration}ms`);

        const headersToSend = {};
        response.headers.forEach((value, key) => {
            if (!['content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
                headersToSend[key] = value;
                res.setHeader(key, value);
            }
        });

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Cache-Control', 'no-transform');
        res.setHeader('X-Cache', 'MISS');

        // ⬇️ Tambahkan fitur download langsung
        const fileName = fullUrl.split('/').pop();
        if (fileName.endsWith('.xml') || fileName.endsWith('.rttex')) {
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        }

        res.status(response.status);

        if (response.status === 200) {
            responseCache.set(cacheKey, {
                status: response.status,
                headers: headersToSend,
                expiry: now + CACHE_EXPIRATION
            });
        }

        // Streaming langsung (super cepat)
        response.body.pipe(res);

    } catch (err) {
        console.error("Proxy Error:", err);
        res.status(500).send("Proxy Error");
    }
});

module.exports = router;