const router = require("express").Router();
const fetch = require("node-fetch");
const https = require("https");
const os = require("os");

// Bypass SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Simple in-memory cache
const responseCache = new Map();
const CACHE_EXPIRATION = 60 * 60 * 1000; // 1 hour

const blacklist = [
    "ezdekauti8338.xml", "dongoautis333.xml", "sigmabangget.xml",
    "mangeak9449.xml", "netrohtf99.xml", "gtps777.xml",
    "gtp2929.xml", "gtps3333.xml"
];

// Check system memory usage
const checkMemoryUsage = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemoryPercentage = ((totalMemory - freeMemory) / totalMemory) * 100;

    if (usedMemoryPercentage > 80) {
        console.warn('Memory usage exceeds 80%, clearing all cache...');
        responseCache.clear();
    }
    return usedMemoryPercentage;
};

// Clean expired cache entries
const cleanExpiredCache = () => {
    const now = Date.now();
    for (const [key, entry] of responseCache.entries()) {
        if (now > entry.expiry) {
            responseCache.delete(key);
        }
    }
};
setInterval(cleanExpiredCache, 5 * 60 * 1000); // every 5 mins

// Route handler
router.get("/:ip/cache/*", async (req, res, next) => {
    if (!req.params.ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) return next();

    try {
        const originalUrl = req.originalUrl;
        const isBlacklisted = blacklist.some(item => originalUrl.includes(item));
        if (isBlacklisted) {
            console.warn(`Blocked blacklisted URL: ${originalUrl}`);
            return res.status(404).send('Access Denied');
        }

        checkMemoryUsage();

        const cacheKey = `${req.method}:${req.originalUrl}`;
        const now = Date.now();
        const cached = responseCache.get(cacheKey);
        const forceRefresh = req.query.force === 'true';

        if (!forceRefresh && cached && now < cached.expiry) {
            console.log(`Cache HIT: ${cacheKey}`);
            res.writeHead(cached.status, cached.headers);
            return res.end(cached.body);
        }

        console.log(forceRefresh ? `Force refresh for: ${cacheKey}` : `Cache MISS: ${cacheKey}`);

        delete req.headers['content-length'];
        delete req.headers['transfer-encoding'];
        req.headers.host = 'www.growtopia1.com';

        const agent = new https.Agent({ rejectUnauthorized: false });

        const options = {
            method: req.method,
            headers: req.headers,
            agent: agent
        };

        if (req.method === 'POST' || req.method === 'PUT') {
            const chunks = [];
            await new Promise(resolve => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', () => {
                    if (chunks.length) {
                        options.body = Buffer.concat(chunks);
                    }
                    resolve();
                });
            });
        }

        const fetchUrl = 'https:/' + originalUrl;
        const startTime = Date.now();
        const response = await fetch(fetchUrl, options);
        const elapsed = Date.now() - startTime;
        console.log(`Fetched from origin in ${elapsed}ms -> ${fetchUrl}`);

        const headersToSend = {};
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-length' && key.toLowerCase() !== 'transfer-encoding') {
                headersToSend[key] = value;
            }
        });

        const buffer = await response.buffer();
        res.writeHead(response.status, headersToSend);
        res.end(buffer);

        if (response.status === 200) {
            responseCache.set(cacheKey, {
                status: response.status,
                headers: headersToSend,
                body: buffer,
                expiry: now + CACHE_EXPIRATION
            });
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(200).send('Internal Server Error');
    }
});

module.exports = router;