const mongoose = require('mongoose');

const ejercicioSchema = new mongoose.Schema({
  nombre: { type: String, default: '' },
  series: { type: Number, default: 0 },
  repeticiones: { type: String, default: '' },
  descanso: { type: String, default: '' },
  peso: { type: String, default: '' },
  indicaciones: { type: String, default: '' },
  imagen: { type: String, default: '' },

  // Identifica ejercicios combinados: A, B, C...
  grupo: { type: String, default: '' }

}, { _id: true });

const calentamientoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  duracion: { type: String, default: '' },
  indicaciones: { type: String, default: '' }
}, { _id: true });

const rutinaSchema = new mongoose.Schema({
  alumno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true,
    index: true
  },

  dia: {
    type: String,
    required: true
  },

  titulo: {
    type: String,
    required: true
  },

  calentamiento: {
    type: [calentamientoSchema],
    default: []
  },

  ejercicios: {
    type: [ejercicioSchema],
    default: []
  },

  profesor: {
    type: String,
    default: ''
  },

  actualizada: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

module.exports = mongoose.model('Rutina', rutinaSchema);