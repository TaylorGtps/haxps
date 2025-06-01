const router = require("express").Router();
const fetch = require("node-fetch");
const https = require("https");
const os = require('os');
const stream = require("stream");
const { promisify } = require("util");
const pipeline = promisify(stream.pipeline);

// bypass SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// In-memory cache
const responseCache = new Map();
const CACHE_EXPIRATION = 60 * 60 * 1000;

const checkMemoryUsage = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const used = ((totalMemory - freeMemory) / totalMemory) * 100;

    console.log(`Memory usage: ${used.toFixed(2)}%`);
    if (used > 80) {
        console.log('Memory usage exceeds 80%, clearing all cache...');
        responseCache.clear();
    }
    return used;
};

const cleanExpiredCache = () => {
    const now = Date.now();
    for (const [key, entry] of responseCache.entries()) {
        if (now > entry.expiry) responseCache.delete(key);
    }
};
setInterval(cleanExpiredCache, 5 * 60 * 1000);

const blacklist = [
    "ezdekauti8338.xml","dongoautis333.xml","sigmabangget.xml",
    "mangeak9449.xml","netrohtf99.xml","gtps777.xml",
    "gtp2929.xml","gtps3333.xml"
];

router.get("/:ip/cache/*", async (req, res, next) => {
    if (!req.params.ip.match(/^\d{1,3}(\.\d{1,3}){3}$/)) return next();

    try {
        const originalUrl = req.originalUrl;
        const isBlacklisted = blacklist.some(item => originalUrl.includes(item));
        if (isBlacklisted) {
            console.log(`Blocked blacklisted URL: ${originalUrl}`);
            return res.status(404).send('Access Denied');
        }

        checkMemoryUsage();

        const cacheKey = `${req.method}:${originalUrl}`;
        const now = Date.now();

        // Serve from cache (send cached buffer)
        if (responseCache.has(cacheKey)) {
            const cached = responseCache.get(cacheKey);
            if (now < cached.expiry) {
                console.log(`Cache hit for: ${cacheKey}`);
                res.status(cached.status);
                for (const [key, value] of Object.entries(cached.headers)) {
                    res.setHeader(key, value);
                }
                return res.end(cached.body);
            } else {
                responseCache.delete(cacheKey);
            }
        }

        delete req.headers['content-length'];
        delete req.headers['transfer-encoding'];
        req.headers.host = 'www.growtopia1.com';

        const agent = new https.Agent({ rejectUnauthorized: false });
        const options = {
            method: req.method,
            headers: req.headers,
            agent: agent,
        };

        if (req.method === 'POST' || req.method === 'PUT') {
            let bodyData = '';
            req.on('data', chunk => bodyData += chunk.toString());
            await new Promise(resolve => req.on('end', () => {
                if (bodyData) options.body = bodyData;
                resolve();
            }));
        }

        const response = await fetch("https:/" + originalUrl, options);

        // Set headers
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            if (!['content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
                responseHeaders[key] = value;
            }
        });

        res.status(response.status);

        // Cache the response body (buffer) while streaming
        if (response.status === 200) {
            const chunks = [];
            const passthrough = new stream.PassThrough();

            response.body.on('data', chunk => {
                chunks.push(chunk);
                passthrough.write(chunk);
            });

            response.body.on('end', () => {
                const fullBuffer = Buffer.concat(chunks);
                responseCache.set(cacheKey, {
                    status: response.status,
                    headers: responseHeaders,
                    body: fullBuffer,
                    expiry: now + CACHE_EXPIRATION
                });
                passthrough.end();
            });

            response.body.on('error', err => {
                console.error("Streaming error:", err);
                res.status(500).send("Stream failed");
            });

            passthrough.pipe(res);
        } else {
            // Jika bukan 200, stream langsung tanpa cache
            await pipeline(response.body, res);
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;