const express = require('express');
const compression = require('compression');
const NodeCache = require('node-cache');
const axios = require('axios');
const cors = require('cors');
const os = require('os');

const port = process.env.PORT || 3000;
const app = express();
const cache = new NodeCache({ stdTTL: 172800, checkperiod: 3600 }); // TTL = 24h, auto-clean every 2 min

app.set('view engine', 'ejs');
app.set('view cache', true);
app.use(compression());

// Define CORS options
const corsOptions = {
    origin: 'https://tradingref.com', // Only allow your own domain to access the API
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
    credentials: false, // Allow credentials (cookies, headers) to be sent
};

// Use CORS middleware with the defined options
app.use(cors(corsOptions));

app.get('/news/:slug', async (req, res) => {
    const id = req.params.slug;
    let slug = id.split(':0-')[0];

    if (slug.slice(-2) !== ':0') {
        slug = slug + ':0';
        if (slug.includes('reuters')) {
            slug = 'tag:' + slug;
        } else if (slug.includes('mtnewswires')) {
            slug = 'urn:newsml:' + slug;
        }
    } else {
        if (slug.includes('reuters')) {
            slug = 'tag:' + slug;
        } else if (slug.includes('mtnewswires')) {
            slug = 'urn:newsml:' + slug;
        }
    }

    const cacheKey = `news-${slug}`;
    const cached = cache.getTtl(cacheKey) ? cache.get(cacheKey) : null;

    if (cached) {
        const ttl = cache.getTtl(cacheKey);
        const createdAt = ttl - cache.options.stdTTL * 1000;
        const ageInSeconds = Math.floor((Date.now() - createdAt) / 1000);
        const timeLeft = Math.floor((ttl - Date.now()) / 1000);
        const mainDataStr = JSON.stringify(cached);
        res.set('Content-Security-Policy', "frame-ancestors 'self' https://tradingref.com");
        res.set('Cache-Control', 'public, max-age=172800');
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Age', ageInSeconds.toString());
        res.set('X-Cache-TTL', timeLeft.toString());
        res.set('X-Frame-Options', 'SAMEORIGIN'); // For legacy iframe protection
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.set('X-XSS-Protection', '1; mode=block');
        return res.render('base_template', {
            Title: cached.title,
            description: cached.shortDescription,
            canonical: cached.storyPath,
            id: cached.id,
            provider: cached.provider.name,
            provider_id: cached.provider.id,
            main_data: mainDataStr,
        });
    }

    try {
        const api_res = await axios.get(`https://news-headlines.tradingview.com/v3/story?id=${slug}&lang=en`);
        const details = api_res.data;

        cache.set(cacheKey, details);
        res.set('Content-Security-Policy', "frame-ancestors 'self' https://tradingref.com");
        res.set('Cache-Control', 'public, max-age=172800');
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-Age', '0');
        res.set('X-Frame-Options', 'SAMEORIGIN'); // For legacy iframe protection
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.set('X-XSS-Protection', '1; mode=block');
        const mainDataStr = JSON.stringify(details);
        return res.render('base_template', {
            Title: details.title,
            description: details.shortDescription,
            canonical: details.storyPath,
            id: details.id,
            provider: details.provider.name,
            provider_id: details.provider.id,
            main_data: mainDataStr,
        });
    } catch (error) {
        return res.status(500).send('Error fetching data.');
    }
});

let totalRequests = 0;
app.use((req, res, next) => {
    totalRequests++;
    next();
});

app.get('/admin/metrics', (req, res) => {
    const memoryUsage = process.memoryUsage();
    const cpuLoad = os.loadavg(); // [1 min, 5 min, 15 min]
    const uptime = process.uptime();
    const cacheStats = cache.getStats(); // from node-cache

    const cacheKeys = cache.keys();
    const cacheTtls = cacheKeys.map(key => ({
        key,
        ttl: Math.floor((cache.getTtl(key) - Date.now()) / 1000)
    }));

    res.render('admin_dashboard', {
        system: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: Math.floor(uptime),
            cpuLoad,
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
            }
        },
        app: {
            totalRequests,
            cacheStats,
            cacheTtls,
        }
    });
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(port, () => {
    console.log('Server running at http://127.0.0.1:3000');
});
