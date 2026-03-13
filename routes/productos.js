const express = require('express');
const router = express.Router();
const productoController = require('../controller/productoController');

router.get('/', productoController.listarProductos);
router.get('/nuevo', productoController.formularioNuevo);
router.post('/nuevo', productoController.guardarProducto);
router.get('/editar/:id', productoController.formularioEditar);
router.post('/editar/:id', productoController.actualizarProducto);
router.post('/eliminar/:id', productoController.eliminarProducto);

module.exports = router;