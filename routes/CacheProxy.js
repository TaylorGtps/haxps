const router = require("express").Router();
const fetch = require("node-fetch");
const https = require("https");
const os = require("os");

// Bypass SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// In-memory cache (only headers, not body)
const responseCache = new Map();
const CACHE_EXPIRATION = 60 * 60 * 1000; // 1 hour

const blacklist = [
    "ezdekauti8338.xml", "dongoautis333.xml", "sigmabangget.xml",
    "mangeak9449.xml", "netrohtf99.xml", "gtps777.xml",
    "gtp2929.xml", "gtps3333.xml"
];

const checkMemoryUsage = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = ((totalMemory - freeMemory) / totalMemory) * 100;
    if (usedMemory > 80) {
        console.warn("Memory > 80%, clearing cache...");
        responseCache.clear();
    }
};

const cleanExpiredCache = () => {
    const now = Date.now();
    for (const [key, entry] of responseCache.entries()) {
        if (now > entry.expiry) responseCache.delete(key);
    }
};
setInterval(cleanExpiredCache, 5 * 60 * 1000);

router.get("/:ip/cache/*", async (req, res, next) => {
    if (!req.params.ip.match(/^\d{1,3}(\.\d{1,3}){3}$/)) return next();

    try {
        const originalUrl = req.originalUrl;
        const isBlacklisted = blacklist.some(item => originalUrl.includes(item));
        if (isBlacklisted) {
            console.warn(`Blocked: ${originalUrl}`);
            return res.status(404).send("Access Denied");
        }

        checkMemoryUsage();

        const cacheKey = `${req.method}:${originalUrl}`;
        const now = Date.now();
        const cached = responseCache.get(cacheKey);
        const forceRefresh = req.query.force === "true";

        if (!forceRefresh && cached && now < cached.expiry) {
            console.log(`Cache HIT headers only: ${cacheKey}`);
            res.writeHead(cached.status, cached.headers);
            return res.end("Cached body not available in stream mode.");
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

        const fetchUrl = "https:/" + originalUrl;
        const start = Date.now();
        const response = await fetch(fetchUrl, options);
        const duration = Date.now() - start;

        console.log(`Fetched in ${duration}ms → ${fetchUrl}`);

        // Set headers (except problematic ones)
        const headersToSend = {};
        response.headers.forEach((value, key) => {
            if (!["content-length", "transfer-encoding"].includes(key.toLowerCase())) {
                res.setHeader(key, value);
                headersToSend[key] = value;
            }
        });

        res.status(response.status);

        // Cache only headers
        if (response.status === 200) {
            responseCache.set(cacheKey, {
                status: response.status,
                headers: headersToSend,
                expiry: now + CACHE_EXPIRATION
            });
        }

        // Pipe the response directly (FASTEST)
        response.body.pipe(res);

    } catch (err) {
        console.error("Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = router;