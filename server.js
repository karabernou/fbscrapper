import express from 'express';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const puppeteer = puppeteerExtra.default || puppeteerExtra;
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    let browser;
    try {
        // Use the executable path defined in the Dockerfile
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', // Critical for free servers
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Try to click "See more"
        try {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('div[role="button"], span'));
                for (let btn of buttons) {
                    if (btn.innerText.includes('See more') || btn.innerText.includes('عرض المزيد')) {
                        btn.click();
                        break;
                    }
                }
            });
            await new Promise(r => setTimeout(r, 1000)); 
        } catch (e) {}

        const data = await page.evaluate(() => {
            let fullText = '';
            let images = [];
            const article = document.querySelector('[role="article"]') || document.body;

            const textDivs = article.querySelectorAll('div[dir="auto"]');
            let textBlocks = [];
            textDivs.forEach(div => {
                if (div.innerText.trim().length > 30) textBlocks.push(div.innerText.trim());
            });
            fullText = [...new Set(textBlocks)].join('\n\n');

            if (!fullText) fullText = document.querySelector('meta[property="og:description"]')?.content || '';

            const imgTags = article.querySelectorAll('img');
            imgTags.forEach(img => {
                const src = img.getAttribute('src');
                if (src && src.includes('scontent') && !src.includes('emoji')) images.push(src);
            });

            return { raw_text: fullText, images: [...new Set(images)] };
        });

        await browser.close();

        const cleanText = data.raw_text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

        res.status(200).json({ success: true, clean_text: cleanText, images: data.images });

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deep Scraper running on port ${PORT}`);
});