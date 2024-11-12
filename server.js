const express = require('express');
const cors = require('cors');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode');
const app = express();

// Cargar variables de entorno desde .env
require('dotenv').config();

app.use(express.json());

// Leer los orígenes permitidos desde la variable de entorno
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];

// Configurar CORS
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Permitir solicitudes sin origen
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configuración del cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './wwebjs_auth' // O la ruta que uses en render.com
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
