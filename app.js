const express = require('express');
const compression = require('compression');
const axios = require('axios');
const cors = require('cors');

const port = 3000;
const app = express();

app.set('view engine', 'ejs');
app.use(compression());

// Define CORS options
const corsOptions = {
    origin: 'https://tradingref.com', // Only allow your own domain to access the API
    methods: ['GET'], // Specify allowed methods
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

    try {
        const api_res = await axios.get(`https://news-headlines.tradingview.com/v3/story?id=${slug}&lang=en`);
        const details = api_res.data;

        res.set('Content-Security-Policy', "frame-ancestors 'self' https://tradingref.com");
        res.set('Cache-Control', 'public, max-age=172800');
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

app.listen(port, () => {
    console.log('Server running at http://127.0.0.1:3000');
});

module.exports = app;