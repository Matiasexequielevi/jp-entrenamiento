const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client;

function iniciarWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth(), // guarda sesión
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    console.log('\n📲 ESCANEAR QR DE WHATSAPP:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp conectado correctamente');
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado');
  });

  client.on('auth_failure', () => {
    console.log('❌ Error de autenticación');
  });

  client.initialize();
}

async function enviarMensaje(numero, mensaje) {
  try {
    if (!client) {
      console.log('⚠️ WhatsApp no inicializado');
      return;
    }

    const numeroFormateado = `54${numero}@c.us`; // Argentina

    await client.sendMessage(numeroFormateado, mensaje);
    console.log('📩 Mensaje enviado a', numero);

  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
  }
}

module.exports = {
  iniciarWhatsApp,
  enviarMensaje
};