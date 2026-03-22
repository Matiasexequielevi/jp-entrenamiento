const express = require('express');
const router = express.Router();
const gastoController = require('../controller/gastoController');

// Listado + filtros (desde / hasta)
router.get('/', gastoController.listarGastos);

// Crear nuevo gasto
router.post('/nuevo', gastoController.guardarGasto);

module.exports = router;