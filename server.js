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
        res.status(500).json({ error: "Error interno al generar el documento.", details: error.message, stack: error.stack });
    }
});

/**
 * 2. Endpoint para Crear Preferencia de Mercado Pago
 */
app.post('/api/checkout', async (req, res) => {
    try {
        let { items, clientInfo, total, phone } = req.body;
        
        // Fallback en caso de que BuilderBot solo envíe { phone: '{from}', accion: 'presupuesto_formal' }
        if (!items || items.length === 0) {
            console.log(`⚠️ No se recibieron items desde BuilderBot para el teléfono ${phone || 'desconocido'}. Usando carrito de demostración.`);
            items = [{ title: "Ladrillo Hueco 18x18x33 (Demo)", quantity: 100, unit_price: 500 }];
            clientInfo = { name: "Cliente Automático", phone: phone || "Sin número", email: "demo@demo.com" };
            total = 50000;
        }

        // Formatear items para MP
        const mpItems = items.map(item => ({
            id: item.id || "ITEM",
            title: item.title,
            quantity: Number(item.quantity),
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

/**
 * 4. Endpoint Unificado para BuilderBot
 * Genera el PDF, genera el link de MP, y devuelve todo en un campo "mensaje"
 */
app.post('/api/generate', async (req, res) => {
    try {
        let { items, clientInfo, total, phone } = req.body;
        
        // BuilderBot a veces envía el array como un string JSON
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch (e) {
                console.error("No se pudo parsear items como JSON:", items);
            }
        }

        // Fallback demo si no hay items
        if (!items || items.length === 0) {
            console.log(`⚠️ No se recibieron items desde BuilderBot para el teléfono ${phone || 'desconocido'}. Usando carrito demo.`);
            items = [{ title: "Ladrillo Hueco 18x18x33 (Demo)", quantity: 100, unit_price: 500 }];
            clientInfo = { name: "Cliente", phone: phone || "Sin número", email: "demo@demo.com" };
            total = 50000;
        }

        // 1. Generar PDF
        const timestamp = Date.now();
        const pdfFileName = `presupuesto_${timestamp}.pdf`;
        const pdfPath = path.join(pdfDir, pdfFileName);
        
        if (!Array.isArray(items)) {
            console.error("⚠️ items no es un array! Forzando a array vacío. Valor recibido:", items);
            items = [];
        }

        // Si no mandan el total, lo calculamos sumando los items
        if (total === undefined) {
            total = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price || 0)), 0);
        }
        
        // Si no mandan info del cliente, armamos una por defecto
        if (!clientInfo) {
            clientInfo = { name: "Consumidor Final", phone: phone || "-", email: "correo@ejemplo.com" };
        }

        // Asignamos una subtotal genérica si no viene
        const subtotal = total; 
        
        await generatePDF({
            clientInfo, items, subtotal, discount: 0, shipping: 0, total, isFormalInvoice: true,
            pdfPath, jpgPath: path.join(pdfDir, `presupuesto_${timestamp}.jpg`)
        });

        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const pdfUrl = `${protocol}://${host}/public/pdfs/${pdfFileName}`;

        // 2. Generar Link MercadoPago
        const mpItems = items.map(item => ({
            id: item.id || "ITEM",
            title: item.title,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price)
        }));

        const preference = new Preference(client);
        const preferenceBody = {
            items: mpItems,
            payer: {
                email: clientInfo.email || 'correo@ejemplo.com',
                name: clientInfo.name || 'Cliente',
            },
            binary_mode: true
        };

        const result = await preference.create({ body: preferenceBody });
        const mpUrl = result.init_point;

        // 3. Devolver formato exacto para BuilderBot
        const mensajeTexto = `¡Listo! Acá tenés tu presupuesto oficial 📄\n\n📥 *Descargar PDF:* ${pdfUrl}\n\n💳 *Link de pago seguro (MercadoPago):* ${mpUrl}\n\n¡Avisame cuando realices el pago así avanzamos con tu pedido!`;

        res.json({ mensaje: mensajeTexto });

    } catch (error) {
        console.error("Error unificado:", error);
        res.status(200).json({ mensaje: "🛠️ DIAGNÓSTICO: Error en el servidor al generar PDF. Detalles: " + error.message + " | Stack: " + String(error.stack).substring(0,200) });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo localmente en el puerto ${PORT}`);
    });
}

module.exports = app;
