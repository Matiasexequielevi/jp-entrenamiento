const Cliente = require('../models/cliente');

// Mostrar todos los clientes con resumen real de pagos
exports.listarClientes = async (req, res) => {
  const clientes = await Cliente.find().sort({ creadoEn: -1 });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let totalClientes = clientes.length;
  let alDia = 0;
  let vencidos = 0;
  let totalRecaudadoHoy = 0;

  clientes.forEach(cliente => {
    let ultimoPago = null;

    if (cliente.pagos && cliente.pagos.length > 0) {
      // Buscar el último pago
      ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
        return new Date(actual.fecha) > new Date(ultimo.fecha) ? actual : ultimo;
      });

      // Sumar pagos de hoy
      cliente.pagos.forEach(p => {
        const fechaPago = new Date(p.fecha);
        if (fechaPago >= hoy) {
          totalRecaudadoHoy += p.monto;
        }
      });
    }

    // Verificar si está al día
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
      totalRecaudado: totalRecaudadoHoy // solo del día
    }
  });
};


  res.render('index', {
    clientes,
    resumen: {
      totalClientes,
      alDia,
      vencidos,
      totalRecaudado
    }
  });


exports.formularioNuevo = (req, res) => {
  res.render('nueva');
};

exports.guardarCliente = async (req, res) => {
  try {
    const nuevoCliente = new Cliente(req.body);
    await nuevoCliente.save();
    res.redirect('/');
  } catch (error) {
    console.error('Error al guardar cliente:', error);
    res.status(500).send('Error al guardar cliente');
  }
};

exports.formularioEditar = async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    res.render('editar', { cliente });
  } catch (error) {
    res.status(500).send('Error al cargar cliente');
  }
};

exports.actualizarCliente = async (req, res) => {
  try {
    await Cliente.findByIdAndUpdate(req.params.id, req.body);
    res.redirect('/editar/' + req.params.id);
  } catch (error) {
    res.status(500).send('Error al actualizar cliente');
  }
};

exports.eliminarCliente = async (req, res) => {
  try {
    await Cliente.findByIdAndDelete(req.params.id);
    res.redirect('/');
  } catch (error) {
    res.status(500).send('Error al eliminar cliente');
  }
};

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

exports.eliminarPago = async (req, res) => {
  const { clienteId, pagoId } = req.params;
  try {
    await Cliente.findByIdAndUpdate(clienteId, {
      $pull: { pagos: { _id: pagoId } }
    });
    res.redirect('/editar/' + clienteId);
  } catch (error) {
    res.status(500).send('Error al eliminar el pago');
  }
};

// REPORTES
exports.reportePagos = async (req, res) => {
  const filtro = req.query.filtro || 'hoy';
  const hoy = new Date();
  const inicio = new Date();

  switch (filtro) {
    case 'semana':
      inicio.setDate(hoy.getDate() - 7);
      break;
    case 'mes':
      inicio.setMonth(hoy.getMonth() - 1);
      break;
    case 'anio':
      inicio.setFullYear(hoy.getFullYear() - 1);
      break;
    default: // hoy
      inicio.setHours(0, 0, 0, 0);
  }

  const clientes = await Cliente.find();

  let pagosFiltrados = [];

  clientes.forEach(cliente => {
    const pagosValidos = cliente.pagos.filter(p => new Date(p.fecha) >= inicio);
    pagosValidos.forEach(p => {
      pagosFiltrados.push({
        nombre: cliente.nombre + ' ' + cliente.apellido,
        fecha: new Date(p.fecha),
        monto: p.monto
      });
    });
  });

  pagosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const total = pagosFiltrados.reduce((acc, pago) => acc + pago.monto, 0);

  res.render('reportes', {
    pagos: pagosFiltrados,
    total,
    filtro
  });
};
