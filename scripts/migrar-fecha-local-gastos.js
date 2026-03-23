const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Gasto = require('../models/Gasto');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function getArgentinaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

async function main() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error('No se encontró MONGODB_URI en el archivo .env');
    }

    console.log('⏳ Conectando a MongoDB...');

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      family: 4
    });

    console.log('✅ Conectado a MongoDB');

    const gastos = await Gasto.find();

    for (const gasto of gastos) {
      const fechaLocal = getArgentinaDateParts(new Date(gasto.fecha));
      gasto.fechaLocal = fechaLocal;
      await gasto.save();
      console.log(`✔ ${gasto.descripcion} → ${fechaLocal}`);
    }

    console.log('🎉 Migración terminada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();