require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { generatePDF } = require('./pdfGenerator');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Inicializar Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Función para notificar a Google Apps Script sobre cambios de estado
async function notificarAppsScript(phone, accion, extra = {}) {
    const url = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbROlxMaTkndiRkEYecF6m6O2m9SEx3w8O3r8coo90X3uITHBAI2lUq28BktUWGeS_Q/exec";
    
    // Normalizar teléfono
    let cleanPhone = phone ? String(phone).replace(/\D/g, "") : "";
    if (cleanPhone.startsWith("549") && cleanPhone.length === 13) {
        cleanPhone = "54" + cleanPhone.substring(3);
    }

    const payload = {
        phone: cleanPhone,
        accion: accion,
        ...extra
    };

    console.log(`📡 Notificando a Apps Script (${accion}) para teléfono ${cleanPhone}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        console.log(`📡 Respuesta de Apps Script [${response.status}]:`, text);
        return response.ok;
    } catch (error) {
        console.error(`❌ Error notificando a Apps Script:`, error.message);
        return false;
    }
}

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
            external_reference: phone,
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
    try {
        const paymentId = req.query.id || req.body?.data?.id;
        console.log("🔔 Webhook recibido de Mercado Pago! ID de Pago:", paymentId);
        
        if (paymentId) {
            // Consultar los detalles del pago a MercadoPago
            const payment = new Payment(client);
            const paymentDetails = await payment.get({ id: paymentId });
            
            console.log("💸 Detalles del pago obtenidos:", {
                status: paymentDetails.status,
                status_detail: paymentDetails.status_detail,
                external_reference: paymentDetails.external_reference,
                transaction_amount: paymentDetails.transaction_amount
            });

            const phone = paymentDetails.external_reference;
            const status = paymentDetails.status;

            if (status === 'approved' && phone) {
                console.log(`✅ Pago aprobado de $${paymentDetails.transaction_amount} para el teléfono ${phone}`);
                // Notificar a Google Apps Script
                await notificarAppsScript(phone, "registrar_pago", {
                    paymentId: paymentId,
                    amount: paymentDetails.transaction_amount
                });
            } else {
                console.log(`ℹ️ Pago con estado [${status}] no requiere registrar_pago o no posee teléfono.`);
            }
        }
    } catch (error) {
        console.error("❌ Error procesando webhook de Mercado Pago:", error.message);
    }
    
    // Responder 200 siempre a MercadoPago para evitar reintentos
    res.status(200).send("OK");
});

/**
 * 4. Endpoint Unificado para BuilderBot
 * Genera el PDF, genera el link de MP, y devuelve todo en un campo "mensaje"
 */
app.post('/api/generate', async (req, res) => {
    try {
        let { items, clientInfo, total, phone, datos } = req.body;
        
        // BuilderBot a veces envía el array como un string JSON
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch (e) {
                console.error("No se pudo parsear items como JSON:", items);
            }
        }

        // A veces el usuario pone {datos} dentro de la propiedad "items" del JSON en BuilderBot.
        // Si "items" resultó ser un objeto que adentro tiene "items", entonces es el objeto "datos" camuflado.
        if (items && typeof items === 'object' && !Array.isArray(items) && items.items) {
            datos = items;
        }

        // Si BuilderBot envía el objeto "datos" directamente (evitando usar IA para Salida Estructurada)
        if (typeof datos === 'string') {
            try {
                datos = JSON.parse(datos);
            } catch (e) {
                console.error("Error parseando datos:", e);
            }
        }

        if (datos && datos.items) {
            items = datos.items.map(item => ({
                userQuery: item.solicitado,
                title: item.nombreOficial || item.solicitado,
                quantity: item.cantidad,
                unit_price: item.precioUnitario
            }));
            total = datos.total || total;
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
        if (total === undefined || total === null) {
            total = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price || 0)), 0);
        }
        
        // Si no mandan info del cliente, armamos una por defecto
        if (!clientInfo) {
            clientInfo = { name: "Consumidor Final", phone: phone || "-", email: "correo@ejemplo.com" };
        }

        // Asignamos subtotal e IVA si vienen de datos
        const subtotal = datos?.subtotal || total; 
        const iva = datos?.iva || 0;
        
        await generatePDF({
            clientInfo, items, subtotal, discount: 0, shipping: 0, total, iva, isFormalInvoice: true,
            pdfPath, jpgPath: path.join(pdfDir, `presupuesto_${timestamp}.jpg`)
        });

        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const pdfUrl = `${protocol}://${host}/public/pdfs/${pdfFileName}`;

        // 2. Generar Link MercadoPago
        let mpUrl = "";
        try {
            let mpItems = items.map(item => ({
                id: String(item.id || "ITEM").substring(0, 256),
                title: String(item.title).substring(0, 256),
                quantity: Number(item.quantity) || 1,
                unit_price: Number(item.unit_price) || 0
            })).filter(item => item.unit_price > 0);

            // Añadir el IVA como un ítem extra para que MercadoPago sume el Total Final
            const iva = datos?.iva || 0;
            if (iva > 0) {
                mpItems.push({
                    id: "IVA",
                    title: "IVA (21%)",
                    quantity: 1,
                    unit_price: iva
                });
            }

            if (mpItems.length === 0) {
                if (total > 0) {
                    mpItems.push({
                        id: "TOTAL",
                        title: "Presupuesto General",
                        quantity: 1,
                        unit_price: total
                    });
                } else {
                    throw new Error("unit_price invalid o total 0");
                }
            }

            const host = req.headers.host;
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
            const origin = `${protocol}://${host}`;

            const preference = new Preference(client);
            const preferenceBody = {
                items: mpItems,
                payer: {
                    email: clientInfo.email || 'correo@ejemplo.com',
                    name: clientInfo.name || 'Cliente',
                },
                external_reference: phone,
                binary_mode: true,
                notification_url: `${origin}/api/webhook`
            };

            const result = await preference.create({ body: preferenceBody });
            mpUrl = result.init_point;
        } catch (mpError) {
            console.error("Error generando MP:", mpError.message);
            mpUrl = "";
        }

        // Notificar a Apps Script que el PDF y el Link de Pago fueron creados (NUEVO v5.5 - diferido para enviar mpUrl)
        await notificarAppsScript(phone, "pdf_generado", { pdfUrl, mpUrl });

        // 3. Devolver formato exacto para BuilderBot
        const mensajeTexto = `¡Listo! Acá tenés tu presupuesto oficial 📄\n\n📥 *Descargar PDF:* ${pdfUrl}\n\n¿Te parece bien? ¿Querés que te envíe el link de pago seguro para realizar la compra? Escribí *sí, quiero el link de pago* y te lo envío. 😊`;

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
