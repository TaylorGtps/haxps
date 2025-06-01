const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const https = require('https');
const os = require('os');

// Bypass SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Header-only Cache
const responseCache = new Map();
const CACHE_EXPIRATION = 60 * 60 * 1000; // 1 hour

const blacklist = [
    "ezdekauti8338.xml", "dongoautis333.xml", "sigmabangget.xml",
    "mangeak9449.xml", "netrohtf99.xml", "gtps777.xml",
    "gtp2929.xml", "gtps3333.xml"
];

// Memory check
function checkMemoryUsage() {
    const used = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
    if (used > 80) {
        console.warn("Memory > 80%, clearing cache.");
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

// Main Proxy Route
router.get("/:ip/cache/*", async (req, res, next) => {
    const ip = req.params.ip;
    const fullUrl = req.originalUrl;
    const cacheKey = `${req.method}:${fullUrl}`;
    const force = req.query.force === 'true';
    const now = Date.now();

    if (!ip.match(/^\d{1,3}(\.\d{1,3}){3}$/)) return next();

    if (blacklist.some(bad => fullUrl.includes(bad))) {
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
        return res.end("Cached response header only (body not stored).");
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
        const startTime = Date.now();
        const response = await fetch(targetUrl, options);
        const fetchTime = Date.now() - startTime;
        console.log(`Fetched ${targetUrl} in ${fetchTime}ms`);

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

        res.status(response.status);

        // Cache header only
        if (response.status === 200) {
            responseCache.set(cacheKey, {
                status: response.status,
                headers: headersToSend,
                expiry: now + CACHE_EXPIRATION
            });
        }

        // STREAM response body to client
        response.body.pipe(res);

    } catch (err) {
        console.error("Proxy Error:", err);
        res.status(500).send("Proxy Error");
    }
});

module.exports = router;