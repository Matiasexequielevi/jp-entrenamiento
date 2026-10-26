const mongoose = require('mongoose');

const progresoEntrenamientoSchema = new mongoose.Schema({

  alumno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true,
    index: true
  },

  rutina: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rutina',
    required: true
  },

  fecha: {
    type: String,
    required: true
  },

  dia: {
    type: String,
    required: true
  },

  titulo: {
    type: String,
    default: ''
  },

  ejercicios: [{
    nombre: String,
    completado: {
      type: Boolean,
      default: false
    }
  }],

  actualizado: {
    type: Date,
    default: Date.now
  }

});

progresoEntrenamientoSchema.index(
  { alumno: 1, rutina: 1, fecha: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'ProgresoEntrenamiento',
  progresoEntrenamientoSchema
);