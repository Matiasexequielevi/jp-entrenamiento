const mongoose = require('mongoose');

const gastoSchema = new mongoose.Schema({
  descripcion: { 
    type: String, 
    required: true, 
    trim: true 
  },

  categoria: {
    type: String,
    enum: ['Alquiler', 'Servicios', 'Mercadería', 'Mantenimiento', 'Limpieza', 'Publicidad', 'Sueldos', 'Otros'],
    default: 'Otros'
  },

  monto: { 
    type: Number, 
    required: true, 
    min: 0 
  },

  metodoPago: {
    type: String,
    enum: ['Efectivo', 'Transferencia', 'Mercado Pago', 'Otro'],
    default: 'Efectivo'
  },

  observacion: { 
    type: String, 
    default: '', 
    trim: true 
  },

  fecha: { 
    type: Date, 
    required: true 
  },

  // 🔥 CLAVE PARA SOLUCIONAR TODO
  fechaLocal: {
    type: String,
    required: true
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Gasto', gastoSchema);