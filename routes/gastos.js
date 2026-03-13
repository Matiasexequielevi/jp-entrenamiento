const express = require('express');
const router = express.Router();
const gastoController = require('../controller/gastoController');

router.get('/', gastoController.listarGastos);
router.post('/nuevo', gastoController.guardarGasto);

module.exports = router;