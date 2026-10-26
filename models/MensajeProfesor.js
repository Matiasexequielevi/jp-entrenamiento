const mongoose = require('mongoose');

const mensajeProfesorSchema = new mongoose.Schema({

  titulo: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  mensaje: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },

  destinatario: {
    type: String,
    enum: ['individual', 'grupal'],
    required: true
  },

  alumno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    default: null
  },

  profesor: {
    type: String,
    required: true
  },

  fecha: {
    type: Date,
    default: Date.now
  },

  activo: {
    type: Boolean,
    default: true
  },

  leidoPor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente'
  }]

});

mensajeProfesorSchema.index({ fecha: -1 });

mensajeProfesorSchema.index({
  alumno: 1,
  fecha: -1
});

module.exports = mongoose.model(
  'MensajeProfesor',
  mensajeProfesorSchema
);