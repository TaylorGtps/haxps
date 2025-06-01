const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const fs = require("fs");
const path = require("path");

const router = express.Router();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    timeout: 30000,
    rejectUnauthorized: false,
});

const blacklist = [
    "ezdekauti8338.xml", "dongoautis333.xml", "sigmabangget.xml",
    "mangeak9449.xml", "netrohtf99.xml", "gtps777.xml",
    "gtp2929.xml", "gtps3333.xml"
];

router.get("/:ip/cache/*", async (req, res, next) => {
    const ip = req.params.ip;
    const originalUrl = req.originalUrl;
    const fileName = originalUrl.split("/").pop();
    const cachePath = path.join(CACHE_DIR, fileName);

    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return next();
    if (blacklist.some(entry => originalUrl.includes(entry))) {
        return res.status(403).send("Blocked");
    }

    // Jika file sudah di-cache → langsung kirim
    if (fs.existsSync(cachePath)) {
        console.log("Serving from disk:", fileName);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-transform");
        res.setHeader("Connection", "keep-alive");
        return fs.createReadStream(cachePath).pipe(res);
    }

    // Jika belum ada, ambil dari Growtopia
    const fetchUrl = "https:/" + originalUrl;
    try {
        const response = await fetch(fetchUrl, {
            method: "GET",
            headers: {
                ...req.headers,
                "Host": "www.growtopia1.com",
                "User-Agent": req.get("user-agent") || "Mozilla"
            },
            agent: httpsAgent
        });

        if (!response.ok) {
            return res.status(response.status).send("Failed to fetch file");
        }

        // Simpan ke file dan stream ke klien sekaligus
        console.log("Downloading & caching:", fileName);
        res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-transform");
        res.setHeader("Connection", "keep-alive");

        const fileStream = fs.createWriteStream(cachePath);
        response.body.pipe(fileStream);       // Simpan ke file
        response.body.pipe(res);              // Kirim ke client

    } catch (err) {
        console.error("Download error:", err);
        res.status(500).send("Failed to fetch file");
    }
});

module.exports = router;