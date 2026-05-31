const puppeteer = require('puppeteer');
const fs = require('fs');
const { getHtmlTemplate } = require('./htmlTemplate');

async function generatePDF({ clientInfo, items, subtotal, discount, shipping, total, isFormalInvoice, pdfPath, jpgPath }) {
    const htmlContent = getHtmlTemplate({
        clientInfo, items, subtotal, discount, shipping, total, isFormalInvoice
    });

    // En Railway con la imagen docker, las variables de entorno le dicen a puppeteer donde está el ejecutable.
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: "new"
    });
    
    const page = await browser.newPage();
    
    // Configurar viewport alto para la captura JPG de página completa
    await page.setViewport({ width: 1200, height: 1600 });
    
    // Cargar el HTML
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 3. Generar PDF
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });

    // 4. Generar captura JPG de alta calidad
    await page.screenshot({
        path: jpgPath,
        type: 'jpeg',
        quality: 90,
        fullPage: true
    });

    await browser.close();
}

module.exports = { generatePDF };
