const express = require('express');
const router = express.Router();
const ventaController = require('../controller/ventaController');

router.get('/', ventaController.listarVentas);
router.post('/nueva', ventaController.guardarVenta);

module.exports = router;