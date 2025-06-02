const express = require('express');
const router = express.Router();
const clienteController = require('../controller/clienteController');

// Ruta principal
router.get('/', clienteController.listarClientes);

// Formulario para nuevo cliente
router.get('/nueva', clienteController.formularioNuevo);
router.post('/nueva', clienteController.guardarCliente);

// Editar cliente
router.get('/editar/:id', clienteController.formularioEditar);
router.post('/editar/:id', clienteController.actualizarCliente);

// Eliminar cliente
router.post('/eliminar/:id', clienteController.eliminarCliente);

// Pagos
router.post('/agregar-pago/:id', clienteController.agregarPago);
router.get('/eliminar-pago/:clienteId/:pagoId', clienteController.eliminarPago); // ← corregido aquí

// Reportes
router.get('/reportes', clienteController.reportePagos);

module.exports = router;
