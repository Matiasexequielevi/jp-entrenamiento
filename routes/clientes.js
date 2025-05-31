const express = require('express');
const router = express.Router();
const clienteController = require('../controller/clienteController');

// Ruta principal: listar todos los clientes
router.get('/', clienteController.listarClientes);

// Formulario para agregar un nuevo cliente
router.get('/nueva', clienteController.formularioNuevo);
router.post('/nueva', clienteController.guardarCliente);

// Formulario para editar un cliente
router.get('/editar/:id', clienteController.formularioEditar);
router.post('/editar/:id', clienteController.actualizarCliente);

// Eliminar un cliente
router.post('/eliminar/:id', clienteController.eliminarCliente);

module.exports = router;
