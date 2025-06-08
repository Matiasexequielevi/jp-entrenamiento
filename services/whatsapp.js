// services/whatsapp.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

client.clientReady = false;

client.on('qr', qr => {
  console.log('📲 Escaneá este QR para iniciar sesión en WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  client.clientReady = true;
  console.log('✅ WhatsApp conectado correctamente');
});

client.on('auth_failure', msg => {
  console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', reason => {
  console.warn('⚠️ Cliente desconectado. Razón:', reason);
});

client.initialize();

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
