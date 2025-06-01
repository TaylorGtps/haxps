// Impor modul yang diperlukan
const router = require("express").Router();
const { request } = require("undici"); // Ganti node-fetch dengan undici
const https = require("https");
const os = require("os");
const fs = require("fs").promises;
const path = require("path");
const compression = require("compression"); // Untuk kompresi gzip

// Aktifkan kompresi
router.use(compression());

// Bypass SSL (hati-hati, hanya untuk pengembangan)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Cache di memori untuk respons kecil, cache file untuk file besar
const responseCache = new Map();
const CACHE_EXPIRATION = 60 * 60 * 1000; // 1 jam
const CACHE_DIR = path.join(__dirname, "cache"); // Direktori cache file

// Pastikan direktori cache ada
(async () => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
})();

// Pengecekan memori (dioptimalkan untuk lebih jarang)
const checkMemoryUsage = () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemoryPercentage = ((totalMemory - freeMemory) / totalMemory) * 100;

  if (usedMemoryPercentage > 80) {
    console.log("Memori melebihi 80%, membersihkan cache...");
    responseCache.clear();
    // Hapus cache file jika diperlukan
    fs.readdir(CACHE_DIR).then((files) =>
      files.forEach((file) => fs.unlink(path.join(CACHE_DIR, file)).catch(() => {}))
    );
  }
};

// Pembersihan cache kadaluarsa
const cleanExpiredCache = async () => {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (now > entry.expiry) {
      responseCache.delete(key);
    }
  }
  // Bersihkan file cache kadaluarsa
  const files = await fs.readdir(CACHE_DIR);
  for (const file of files) {
    const filePath = path.join(CACHE_DIR, file);
    const stats = await fs.stat(filePath);
    if (now > stats.mtimeMs + CACHE_EXPIRATION) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
};

// Jalankan pembersihan cache setiap 10 menit
setInterval(cleanExpiredCache, 10 * 60 * 1000);

const blacklist = [
  "ezdekauti8338.xml",
  "dongoautis333.xml",
  "sigmabangget.xml",
  "mangeak9449.xml",
  "netrohtf99.xml",
  "gtps777.xml",
  "gtp2929.xml",
  "gtps3333.xml",
];

// Rute untuk menangani permintaan
router.get("/:ip/cache/*", async (req, res, next) => {
  // Validasi IP
  if (!req.params.ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
    return next();
  }

  try {
    const originalUrl = req.originalUrl;
    const isBlacklisted = blacklist.some((item) => originalUrl.includes(item));

    if (isBlacklisted) {
      console.log(`URL diblokir: ${originalUrl}`);
      return res.status(404).send("Access Denied");
    }

    // Buat kunci cache
    const cacheKey = `${req.method}:${originalUrl}`;
    const cacheFile = path.join(CACHE_DIR, Buffer.from(cacheKey).toString("base64") + ".cache");

    // Cek cache di memori
    if (responseCache.has(cacheKey)) {
      const cachedResponse = responseCache.get(cacheKey);
      if (Date.now() < cachedResponse.expiry) {
        console.log(`Cache hit (memori): ${cacheKey}`);
        res.status(cachedResponse.status);
        for (const [key, value] of Object.entries(cachedResponse.headers)) {
          res.setHeader(key, value);
        }
        return res.send(cachedResponse.body);
      } else {
        responseCache.delete(cacheKey);
      }
    }

    // Cek cache di file
    try {
      const stats = await fs.stat(cacheFile);
      if (Date.now() < stats.mtimeMs + CACHE_EXPIRATION) {
        console.log(`Cache hit (file): ${cacheKey}`);
        res.set("Content-Type", "application/octet-stream"); // Sesuaikan dengan tipe file
        return fs.createReadStream(cacheFile).pipe(res);
      }
    } catch (e) {
      // File cache tidak ada atau kadaluarsa
    }

    // Pengecekan memori (hanya sekali per menit untuk mengurangi overhead)
    if (!global.lastMemoryCheck || Date.now() - global.lastMemoryCheck > 60 * 1000) {
      global.lastMemoryCheck = Date.now();
      checkMemoryUsage();
    }

    // Siapkan header untuk permintaan
    delete req.headers["content-length"];
    delete req.headers["transfer-encoding"];
    req.headers.host = "www.growtopia1.com";

    const agent = new https.Agent({ rejectUnauthorized: false });

    // Gunakan undici untuk streaming
    const { statusCode, headers, body } = await request(`https://${originalUrl}`, {
      method: req.method,
      headers: req.headers,
      agent,
    });

    // Siapkan header respons
    const responseHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== "content-length" && key.toLowerCase() !== "transfer-encoding") {
        responseHeaders[key] = value;
        res.setHeader(key, value);
      }
    }
    res.status(statusCode);

    // Simpan ke cache file untuk file besar
    const tempFile = cacheFile + ".tmp";
    const writeStream = fs.createWriteStream(tempFile);
    body.pipe(writeStream);
    body.pipe(res); // Streaming langsung ke klien

    // Tangani penyelesaian streaming
    await new Promise((resolve, reject) => {
      writeStream.on("finish", async () => {
        await fs.rename(tempFile, cacheFile); // Simpan file cache
        if (statusCode === 200) {
          responseCache.set(cacheKey, {
            status: statusCode,
            headers: responseHeaders,
            body: null, // Tidak simpan di memori, gunakan file
            expiry: Date.now() + CACHE_EXPIRATION,
          });
        }
        resolve();
      });
      writeStream.on("error", reject);
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error"); // Ganti ke status 500
  }
});

// Ekspor router
module.exports = router;