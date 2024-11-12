const express = require('express');
const cors = require('cors');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode');
const app = express();

app.use(express.json());

// Configurar CORS
app.use(cors({
  origin: 'https://tu-dominio-frontend.com', // Reemplaza con el dominio de tu frontend
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Usar LocalAuth para manejar la sesión automáticamente
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './wwebjs_auth' // Cambia esto si usas un directorio diferente
  })
});

client.on('qr', (qr) => {
  // Generar una imagen del código QR y exponerla a través de una ruta
  qrcode.toDataURL(qr, (err, url) => {
    // Guardar la URL del QR para accederla desde el frontend o un endpoint
    // Puedes almacenarla en una variable global o en una base de datos
    // Por simplicidad, la almacenaremos en una variable
    global.qrCode = url;
    console.log('QR Code generado, accede a /qr para verlo');
  });
});

client.on('ready', () => {
  console.log('Cliente de WhatsApp listo!');
  global.qrCode = null; // Limpiar el código QR una vez conectado
});

client.on('authenticated', () => {
  console.log('Autenticado correctamente con WhatsApp');
});

client.on('auth_failure', (message) => {
  console.error('Error de autenticación:', message);
});

client.on('disconnected', (reason) => {
  console.log('Cliente desconectado:', reason);
  client.initialize(); // Intentar reconectar
});

client.initialize();

// Ruta para obtener el código QR
app.get('/qr', (req, res) => {
  if (global.qrCode) {
    res.send(`<img src="${global.qrCode}" alt="QR Code">`);
  } else {
    res.send('Cliente de WhatsApp ya está listo o no hay QR disponible.');
  }
});

// Función para formatear el mensaje de WhatsApp
const formatWhatsAppMessage = (row) => {
  const cliente = row.clientes?.nombre || 'Cliente desconocido';
  const precioPublico = Number(row?.precio_publico) || 0;
  const anticipo = Number(row?.anticipo) || 0;
  const saldo = precioPublico - anticipo;

  return (
    `*Cliente:* ${cliente}\n` +
    `*Producto:* ${row.nombre_producto}\n` +
    `------------------------\n` +
    `*Detalles de la Venta*\n` +
    `------------------------\n` +
    `*Precio:* $${precioPublico.toFixed(2)}\n` +
    `*Anticipo:* $${anticipo.toFixed(2)}\n` +
    `*Saldo:* $${saldo.toFixed(2)}\n` +
    `*Estado:* ${row.estado}\n`
  );
};

app.post('/send-message', async (req, res) => {
  const { phoneNumber, rows } = req.body;

  if (!phoneNumber || !rows || rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Número de teléfono y filas son necesarios' });
  }

  try {
    for (const row of rows) {
      const textMessage = formatWhatsAppMessage(row);

      await client.sendMessage(`${phoneNumber}@c.us`, textMessage);

      if (row.imagen_url) {
        const response = await axios.get(row.imagen_url, { responseType: 'arraybuffer' });
        const media = new MessageMedia('image/jpeg', Buffer.from(response.data).toString('base64'));
        await client.sendMessage(`${phoneNumber}@c.us`, media);
      }
    }

    res.status(200).json({ success: true, message: 'Mensajes enviados' });
  } catch (error) {
    console.error('Error al enviar los mensajes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});
