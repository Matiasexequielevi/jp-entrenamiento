// services/whatsapp.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox']
  }
});

client.clientReady = false; // ✅ Propiedad que podremos verificar desde otros archivos

client.on('qr', qr => {
  console.log('📲 Escaneá este QR para iniciar sesión en WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  client.clientReady = true;
  console.log('✅ WhatsApp conectado correctamente');
});

client.initialize();

// ✅ Función para enviar mensajes solo si está listo
const sendMessage = async (numero, mensaje) => {
  if (!client.clientReady) {
    console.error('❌ Cliente de WhatsApp no está listo aún.');
    return;
  }

  try {
    const numeroFormateado = numero.replace(/\D/g, '');
    const wid = `${numeroFormateado}@c.us`;

    await client.sendMessage(wid, mensaje);
    console.log(`✅ Mensaje enviado a ${numeroFormateado}`);
  } catch (err) {
    console.error(`❌ Error al enviar mensaje a ${numero}:`, err.message);
  }
};

module.exports = {
  client,
  sendMessage
};
