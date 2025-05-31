const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  edad: { type: Number, required: true },
  celular: { type: String, required: true },
  direccion: { type: String, required: true },
  fechaInicio: { type: Date, required: true },
  fechaPago: { type: Date, required: true },

  plan: {
    type: String,
    enum: ['Básico', 'Intermedio', 'Full'],
    required: true
  },

  asistencia: {
    semanal: {
      lunes: { type: Boolean, default: false },
      martes: { type: Boolean, default: false },
      miercoles: { type: Boolean, default: false },
      jueves: { type: Boolean, default: false },
      viernes: { type: Boolean, default: false }
    },
    totalAsistencias: { type: Number, default: 0 } // mensual
  },

  creadoEn: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cliente', clienteSchema);
