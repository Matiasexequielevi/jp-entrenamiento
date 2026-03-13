const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  categoria: { type: String, default: 'General', trim: true },
  descripcion: { type: String, default: '', trim: true },

  precioCompra: { type: Number, default: 0 },
  precioVenta: { type: Number, required: true },

  stock: { type: Number, default: 0 },
  stockMinimo: { type: Number, default: 0 },

  activo: { type: Boolean, default: true },

  creadoEn: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Producto', productoSchema);