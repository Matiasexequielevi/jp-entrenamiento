const Cliente = require('../models/cliente');

// Mostrar todos los clientes con resumen real de pagos
exports.listarClientes = async (req, res) => {
  const clientes = await Cliente.find().sort({ creadoEn: -1 });

  const hoy = new Date();
  let totalClientes = clientes.length;
  let alDia = 0;
  let vencidos = 0;
  let totalRecaudado = 0;

  clientes.forEach(cliente => {
    let ultimoPago = null;

    if (cliente.pagos && cliente.pagos.length > 0) {
      // Buscar el pago más reciente
      ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
        return new Date(actual.fecha) > new Date(ultimo.fecha) ? actual : ultimo;
      });

      totalRecaudado += cliente.pagos.reduce((suma, pago) => suma + pago.monto, 0);
    }

    // Verificar si está al día (último pago dentro de los últimos 30 días)
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    if (ultimoPago && new Date(ultimoPago.fecha) >= hace30Dias) {
      alDia++;
      cliente.estadoPago = 'aldia';
    } else {
      vencidos++;
      cliente.estadoPago = 'vencido';
    }
  });

  res.render('index', {
    clientes,
    resumen: {
      totalClientes,
      alDia,
      vencidos,
      totalRecaudado
    }
  });
};

// Mostrar formulario nuevo
exports.formularioNuevo = (req, res) => {
  res.render('nueva');
};

// Mostrar formulario para editar cliente
exports.formularioEditar = async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    res.render('editar', { cliente });
  } catch (error) {
    res.status(500).send('Error al cargar cliente');
  }
};

// Actualizar cliente
exports.actualizarCliente = async (req, res) => {
  try {
    await Cliente.findByIdAndUpdate(req.params.id, req.body);
    res.redirect('/editar/' + req.params.id);
  } catch (error) {
    res.status(500).send('Error al actualizar cliente');
  }
};

// Eliminar cliente
exports.eliminarCliente = async (req, res) => {
  try {
    await Cliente.findByIdAndDelete(req.params.id);
    res.redirect('/');
  } catch (error) {
    res.status(500).send('Error al eliminar cliente');
  }
};

// Agregar pago
exports.agregarPago = async (req, res) => {
  const { fecha, monto } = req.body;

  try {
    const cliente = await Cliente.findById(req.params.id);
    cliente.pagos.push({ fecha, monto });
    await cliente.save();
    res.redirect('/editar/' + req.params.id);
  } catch (error) {
    res.status(500).send('Error al agregar pago');
  }
};
