const mongoose = require('mongoose');

const ventaSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },

  nombreProducto: { type: String, required: true },

  cantidad: { type: Number, required: true, min: 1 },
  precioUnitario: { type: Number, required: true },
  total: { type: Number, required: true },

  metodoPago: {
    type: String,
    enum: ['Efectivo', 'Transferencia', 'Mercado Pago', 'Otro'],
    default: 'Efectivo'
  },

  observacion: { type: String, default: '', trim: true },

  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Venta', ventaSchema);