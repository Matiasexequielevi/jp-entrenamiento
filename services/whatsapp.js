const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client;

function iniciarWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'jp-entrenamiento'
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    console.log('\n📲 ESCANEÁ ESTE QR DE WHATSAPP:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ WhatsApp cargando... ${percent}% - ${message}`);
  });

  client.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado');
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp conectado y listo');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Falló la autenticación de WhatsApp:', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
  });

  client.initialize().catch((error) => {
    console.error('❌ No se pudo iniciar WhatsApp:', error.message);
  });
}

async function enviarMensaje(numero, mensaje) {
  try {
    if (!client) throw new Error('WhatsApp no fue inicializado');

    const limpio = String(numero || '').replace(/\D/g, '');
    if (!limpio) throw new Error('Número inválido');

    const chatId = `54${limpio}@c.us`;
    await client.sendMessage(chatId, mensaje);
    console.log(`📩 Mensaje enviado a ${numero}`);
  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error.message);
  }
}

module.exports = {
  iniciarWhatsApp,
  enviarMensaje
};