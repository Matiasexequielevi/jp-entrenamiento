// corregirFechas.js
const mongoose = require('mongoose');

// ⚠️ Reemplazá esta URL con tu string de conexión de MongoDB Atlas
const MONGO_URI = 'mongodb+srv://mati10mono:tQIVtQedEvFwYlXX@jp-entrenamiento.xyg8cv9.mongodb.net/?retryWrites=true&w=majority&appName=Jp-entrenamiento';

const clienteSchema = new mongoose.Schema({
  nombre: String,
  apellido: String,
  edad: Number,
  celular: String,
  direccion: String,
  fechaInicio: Date,
  fechaPago: Date,
  plan: String,
  asistencia: Object,
  pagos: [{
    fecha: mongoose.Schema.Types.Mixed,
    monto: Number
  }],
  creadoEn: Date
});

const Cliente = mongoose.model('Cliente', clienteSchema);

async function corregirFechas() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Conectado a MongoDB");

    const clientes = await Cliente.find();

    for (const cliente of clientes) {
      let actualizado = false;

      const nuevosPagos = cliente.pagos.map(pago => {
        if (typeof pago.fecha === 'string') {
          actualizado = true;
          return {
            ...pago,
            fecha: new Date(pago.fecha)
          };
        }
        return pago;
      });

      if (actualizado) {
        cliente.pagos = nuevosPagos;
        await cliente.save();
        console.log(`✅ Fechas corregidas para: ${cliente.nombre} ${cliente.apellido}`);
      }
    }

    console.log("✔️ Corrección finalizada.");
    mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

corregirFechas();
