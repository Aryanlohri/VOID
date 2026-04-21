const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Capture and print console messages from the browser page
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
    
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    
    // Click the New File button
    await page.evaluate(() => {
        const addBtn = document.querySelector('.tab-add');
        if (addBtn) addBtn.click();
        else console.log('Could not find .tab-add');
    });
    
    // Wait for any errors to occur
    await new Promise(r => setTimeout(r, 1000));
    
    await browser.close();
})();
