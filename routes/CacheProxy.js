const express = require("express");
const fetch = require("node-fetch");
const https = require("https");

const router = express.Router();

// Bypass SSL verification
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Blacklisted filenames
const blacklist = [
    "ezdekauti8338.xml", "dongoautis333.xml", "sigmabangget.xml",
    "mangeak9449.xml", "netrohtf99.xml", "gtps777.xml",
    "gtp2929.xml", "gtps3333.xml"
];

router.get("/:ip/cache/*", async (req, res, next) => {
    const ip = req.params.ip;
    const originalUrl = req.originalUrl;
    const filename = originalUrl.split('/').pop();

    // Validate IP format
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return next();

    // Block blacklisted files
    if (blacklist.some(entry => originalUrl.includes(entry))) {
        return res.status(403).send("Blocked");
    }

    // Set request headers
    delete req.headers["content-length"];
    delete req.headers["transfer-encoding"];
    req.headers.host = "www.growtopia1.com";

    const fetchUrl = "https:/" + originalUrl;

    try {
        const response = await fetch(fetchUrl, {
            method: "GET",
            headers: req.headers,
            agent: new https.Agent({ rejectUnauthorized: false }),
        });

        // Pass through important headers
        res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-transform");
        res.setHeader("Connection", "keep-alive");

        // Set response status and stream body
        res.status(response.status);
        response.body.pipe(res);

    } catch (err) {
        console.error("Download failed:", err);
        res.status(500).send("Download failed");
    }
});

module.exports = router;