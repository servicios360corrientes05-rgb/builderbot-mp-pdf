function getHtmlTemplate({ clientInfo, items, subtotal, discount, shipping, total, isFormalInvoice }) {
    // Generar las filas de la tabla iterando sobre los items
    const rows = items.map(item => `
        <tr>
            <td class="desc-col">
                <div class="user-query">"${item.userQuery || 'Producto solicitado'}"</div>
            </td>
            <td class="product-col">
                <div class="exact-product">${item.title}</div>
            </td>
            <td class="qty-col">
                <div class="qty-num">${item.quantity}</div>
                <div class="qty-unit">${item.unit || 'unidad'}</div>
            </td>
            <td class="price-col">$${item.unit_price.toLocaleString('es-AR')}</td>
            <td class="total-col">$${(item.quantity * item.unit_price).toLocaleString('es-AR')}</td>
        </tr>
    `).join('');

    // Determinar el título (Presupuesto o Factura)
    const documentTitle = isFormalInvoice ? "FACTURA C - CONSUMIDOR FINAL" : "PRESUPUESTO OFICIAL";

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            body {
                font-family: 'Inter', sans-serif;
                margin: 0;
                padding: 40px;
                color: #333;
                background-color: #fff;
            }

            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #f0f0f0;
                padding-bottom: 20px;
            }
            .header h1 {
                margin: 0;
                color: #1a1a1a;
                font-size: 24px;
                letter-spacing: 1px;
            }
            
            .client-info {
                margin-bottom: 30px;
                font-size: 14px;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
            }

            th {
                text-align: left;
                padding: 12px;
                border-bottom: 2px solid #e2e8f0;
                color: #64748b;
                font-weight: 600;
                font-size: 13px;
                text-transform: uppercase;
            }

            td {
                padding: 15px 12px;
                border-bottom: 1px solid #e2e8f0;
                vertical-align: middle;
            }

            .desc-col .user-query {
                color: #94a3b8;
                font-style: italic;
                font-size: 13px;
            }
            
            .product-col .exact-product {
                font-weight: 600;
                color: #1e293b;
                font-size: 14px;
            }

            .qty-col {
                text-align: right;
            }
            .qty-col .qty-num {
                font-weight: 600;
                font-size: 14px;
            }
            .qty-col .qty-unit {
                font-size: 12px;
                color: #64748b;
            }

            .price-col {
                text-align: right;
                font-size: 14px;
                color: #475569;
            }

            .total-col {
                text-align: right;
                font-weight: 600;
                font-size: 14px;
                color: #1e293b;
            }

            .summary-section {
                width: 100%;
                margin-top: 20px;
            }

            .summary-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 15px;
                color: #475569;
            }

            .summary-row.discount {
                color: #10b981; /* Verde */
            }

            .summary-row.total-neto {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #e2e8f0;
                font-size: 22px;
                font-weight: 800;
                color: #0f172a;
            }

            .footer-box {
                background-color: #f8fafc;
                border-radius: 12px;
                padding: 24px;
                margin-top: 40px;
            }

            .footer-box h3 {
                font-size: 11px;
                text-transform: uppercase;
                color: #475569;
                margin-top: 0;
                margin-bottom: 15px;
                letter-spacing: 0.5px;
            }

            .payment-methods {
                display: flex;
                justify-content: space-between;
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e2e8f0;
            }

            .payment-method {
                flex: 1;
            }

            .payment-method strong {
                display: block;
                font-size: 13px;
                margin-bottom: 4px;
                color: #1e293b;
            }

            .payment-method span {
                font-size: 13px;
                color: #475569;
            }

            .payment-method .discount-text {
                color: #10b981;
                font-weight: 600;
            }

            .footer-notes {
                display: flex;
                gap: 40px;
                font-size: 12px;
                color: #64748b;
            }
            .footer-notes div {
                display: flex;
                align-items: center;
                gap: 8px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${documentTitle}</h1>
        </div>
        
        <div class="client-info">
            <strong>Cliente:</strong> ${clientInfo?.name || 'Consumidor Final'} <br>
            <strong>Teléfono:</strong> ${clientInfo?.phone || '-'} <br>
            <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-AR')}
        </div>

        <table>
            <thead>
                <tr>
                    <th>Búsqueda Original</th>
                    <th>Producto Exacto</th>
                    <th style="text-align: right">Cantidad</th>
                    <th style="text-align: right">Precio Unit.</th>
                    <th style="text-align: right">Total</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="summary-section">
            <div class="summary-row">
                <span>Subtotal Materiales:</span>
                <span>$${subtotal.toLocaleString('es-AR')}</span>
            </div>
            ${discount > 0 ? `
            <div class="summary-row discount">
                <span>Descuento Aplicado:</span>
                <span>-$${discount.toLocaleString('es-AR')}</span>
            </div>
            ` : ''}
            ${shipping > 0 ? `
            <div class="summary-row">
                <span>Flete / Envío:</span>
                <span>$${shipping.toLocaleString('es-AR')}</span>
            </div>
            ` : ''}
            <div class="summary-row total-neto">
                <span>TOTAL NETO:</span>
                <span>$${total.toLocaleString('es-AR')}</span>
            </div>
        </div>

        <div class="footer-box">
            <h3>CONDICIONES DE VENTA Y FINANCIACIÓN</h3>
            <div class="payment-methods">
                <div class="payment-method">
                    <strong>Pago Contado / Transferencia / MercadoPago:</strong>
                    <span class="discount-text">ARS ${total.toLocaleString('es-AR')} (Descuentos ya aplicados)</span>
                </div>
                <div class="payment-method">
                    <strong>Pago Tarjeta de Crédito (12 Cuotas):</strong>
                    <span>ARS ${(total * 1.25).toLocaleString('es-AR')} (En 12 cuotas fijas de ARS ${((total * 1.25) / 12).toLocaleString('es-AR')})</span>
                </div>
            </div>
            <div class="footer-notes">
                <div>🚚 Servicio Express - Entrega en Obra dentro de las 24/48 hs hábiles</div>
                <div>⏱️ Plazo de Validez: 5 días</div>
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = { getHtmlTemplate };
