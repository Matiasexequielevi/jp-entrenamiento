const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Cliente = require('../models/cliente');

let client;
let clientReady = false;

function normalizarNumeroArgentina(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');

  if (!limpio) return null;

  if (limpio.startsWith('549')) return `${limpio}@c.us`;
  if (limpio.startsWith('54')) return `${limpio}@c.us`;

  return `549${limpio}@c.us`;
}

async function enviarMensaje(numero, mensaje) {
  try {
    if (!client || !clientReady) {
      throw new Error('WhatsApp no está listo');
    }

    const chatId = normalizarNumeroArgentina(numero);
    if (!chatId) {
      throw new Error('Número inválido');
    }

    await client.sendMessage(chatId, mensaje);
    console.log(`📩 Mensaje enviado a ${numero}`);
    return true;
  } catch (error) {
    console.error(`❌ Error enviando WhatsApp a ${numero}:`, error.message);
    return false;
  }
}

async function enviarMensajesAVencidos() {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const hace34Dias = new Date(hoy);
    hace34Dias.setDate(hace34Dias.getDate() - 34);

    const clientes = await Cliente.find({
      celular: { $exists: true, $ne: '' },
      notificado: false
    });

    const vencidos = clientes.filter((cliente) => {
      if (!cliente.pagos || cliente.pagos.length === 0) return false;

      const ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
        return new Date(actual.fecha) > new Date(ultimo.fecha) ? actual : ultimo;
      });

      return new Date(ultimoPago.fecha) < hace34Dias;
    });

    if (!vencidos.length) {
      console.log('✅ No hay clientes vencidos para notificar');
      return;
    }

    console.log(`📋 Clientes vencidos encontrados: ${vencidos.length}`);

    for (const cliente of vencidos) {
      const ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
        return new Date(actual.fecha) > new Date(ultimo.fecha) ? actual : ultimo;
      });

      const mensaje = `Hola ${cliente.nombre} 👋

Te recordamos que tu último pago fue hace más de 30 días.

Por favor, escribinos para regularizar tu cuota y continuar con tus entrenamientos en *JP Entrenamiento Personalizado* 💪`;

      const enviado = await enviarMensaje(cliente.celular, mensaje);

      if (enviado) {
        cliente.notificado = true;
        cliente.ultimoRecordatorioEnviado = new Date();
        await cliente.save();

        console.log(`✅ ${cliente.nombre} ${cliente.apellido} fue notificado`);
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    console.log('✅ Finalizó el envío automático de mensajes a vencidos');
  } catch (error) {
    console.error('❌ Error al enviar mensajes a vencidos:', error.message);
  }
}

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

  client.on('ready', async () => {
    clientReady = true;
    console.log('✅ WhatsApp conectado y listo');

    await enviarMensajesAVencidos();
  });

  client.on('auth_failure', (msg) => {
    clientReady = false;
    console.error('❌ Falló la autenticación de WhatsApp:', msg);
  });

  client.on('disconnected', (reason) => {
    clientReady = false;
    console.log('⚠️ WhatsApp desconectado:', reason);
  });

  client.initialize().catch((error) => {
    console.error('❌ No se pudo iniciar WhatsApp:', error.message);
  });
}

module.exports = {
  iniciarWhatsApp,
  enviarMensaje,
  enviarMensajesAVencidos,
  get client() {
    return client;
  },
  get clientReady() {
    return clientReady;
  }
};