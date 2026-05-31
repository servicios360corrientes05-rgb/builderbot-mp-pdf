require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { generatePDF } = require('./pdfGenerator');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Inicializar Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Asegurar que exista la carpeta public/pdfs
const pdfDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

/**
 * 1. Endpoint para Generar Presupuesto/Proforma (PDF y JPG)
 * Recibe el JSON del carrito y devuelve las URLs de los archivos generados.
 */
app.post('/api/budget', async (req, res) => {
    try {
        const { clientInfo, items, subtotal, discount, shipping, total, isFormalInvoice } = req.body;
        
        const timestamp = Date.now();
        const pdfFileName = `presupuesto_${timestamp}.pdf`;
        const jpgFileName = `presupuesto_${timestamp}.jpg`;
        
        const pdfPath = path.join(pdfDir, pdfFileName);
        const jpgPath = path.join(pdfDir, jpgFileName);

        // Generar el PDF y JPG con Puppeteer
        await generatePDF({
            clientInfo, items, subtotal, discount, shipping, total, isFormalInvoice,
            pdfPath, jpgPath
        });

        // Retornar las URLs públicas (asumiendo host actual)
        const host = req.headers.host;
        const protocol = req.protocol || 'http';
        
        res.json({
            pdfUrl: `${protocol}://${host}/public/pdfs/${pdfFileName}`,
            jpgUrl: `${protocol}://${host}/public/pdfs/${jpgFileName}`
        });

    } catch (error) {
        console.error("Error generando presupuesto:", error);
        res.status(500).json({ error: "Error interno al generar el documento." });
    }
});

/**
 * 2. Endpoint para Crear Preferencia de Mercado Pago
 */
app.post('/api/checkout', async (req, res) => {
    try {
        const { items, clientInfo, total } = req.body;
        
        // Formatear items para MP
        const mpItems = items.map(item => ({
            id: item.id || "ITEM",
            title: item.title,
            quantity: item.quantity,
            unit_price: Number(item.unit_price)
        }));

        // Si hay envío o descuentos, se pueden ajustar como un item más o reflejarlos en el total
        // Por simplicidad, confiaremos en los unit_price de los items ya ajustados o agregaremos un item extra.

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers.host;
        const origin = req.headers.origin || `${protocol}://${host}`;

        const preference = new Preference(client);
        const preferenceBody = {
            items: mpItems,
            payer: {
                email: clientInfo.email || 'correo@ejemplo.com',
                name: clientInfo.name || 'Cliente',
            },
            back_urls: {
                success: `${origin}/success.html`,
                failure: `${origin}/failure.html`,
                pending: `${origin}/pending.html`
            },
            // auto_return: "approved",
            binary_mode: true, // Pagos instantáneos (tarjetas/dinero en cuenta)
            notification_url: `${origin}/api/webhook`
        };

        const result = await preference.create({ body: preferenceBody });
        res.json({ id: result.id, init_point: result.init_point });

    } catch (error) {
        console.error("Error en MP:", error);
        res.status(500).json({ error: "No se pudo crear el link de pago" });
    }
});

/**
 * 3. Webhook de Mercado Pago
 */
app.post('/api/webhook', async (req, res) => {
    const paymentId = req.query.id || req.body?.data?.id;
    console.log("🔔 Webhook recibido de Mercado Pago! ID de Pago:", paymentId);
    
    // Aquí puedes:
    // 1. Consultar la API de MP para verificar que el pago está 'approved'
    // 2. Marcar la fila en Google Sheets como "PAGADO"
    // 3. (Opcional) Llamar a BuilderBot para enviar mensaje de WhatsApp al cliente

    res.status(200).send("OK");
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo localmente en el puerto ${PORT}`);
    });
}

module.exports = app;
