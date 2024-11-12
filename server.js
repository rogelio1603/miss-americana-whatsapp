// server.js

const express = require('express');
const cors = require('cors');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuración de CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (por ejemplo, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Asegurar que el directorio de autenticación existe
const authPath = process.env.AUTH_PATH || './wwebjs_auth';
if (!fs.existsSync(authPath)){
    fs.mkdirSync(authPath, { recursive: true });
}

// Inicializar el cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: authPath
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--window-size=1920,1080'
    ],
  }
});

// Manejo de eventos del cliente
client.on('qr', (qr) => {
  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error('Error al generar el QR:', err);
      return;
    }
    global.qrCode = url;
  });
  console.log('QR Code recibido, accede a /qr para verlo');
});

client.on('authenticated', () => {
  console.log('Autenticado correctamente con WhatsApp');
});

client.on('auth_failure', (message) => {
  console.error('Error de autenticación:', message);
});

client.on('ready', () => {
  console.log('Cliente de WhatsApp listo!');
  global.qrCode = null; // Limpiar el QR una vez autenticado
});

client.on('message', msg => {
  if (msg.body.toLowerCase() === '!ping') {
    msg.reply('pong');
  }
});

client.initialize();

// Ruta para obtener el QR
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

// Ruta para enviar mensajes
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

// Ruta para verificar el estado del cliente
app.get('/status', (req, res) => {
  const status = client.info ? 'Conectado' : 'Desconectado';
  res.status(200).json({ status });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});
