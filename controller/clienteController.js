const Cliente = require('../models/cliente');
const whatsappClient = require('../services/whatsapp'); // ✅ Nuevo import

// Mostrar todos los clientes con resumen real de pagos
exports.listarClientes = async (req, res) => {
  const clientes = await Cliente.find().sort({ creadoEn: -1 });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let totalClientes = clientes.length;
  let alDia = 0;
  let vencidos = 0;
  let totalRecaudadoHoy = 0;

  clientes.forEach(async cliente => {
    let ultimoPago = null;

    if (cliente.pagos && cliente.pagos.length > 0) {
      ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
        return new Date(actual.fecha) > new Date(ultimo.fecha) ? actual : ultimo;
      });

      cliente.pagos.forEach(p => {
        const fechaPago = new Date(p.fecha);
        fechaPago.setHours(0, 0, 0, 0);
        if (fechaPago.getTime() === hoy.getTime()) {
          totalRecaudadoHoy += p.monto;
        }
      });
    }

    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    if (ultimoPago && new Date(ultimoPago.fecha) >= hace30Dias) {
      alDia++;
      cliente.estadoPago = 'aldia';
    } else {
      vencidos++;
      cliente.estadoPago = 'vencido';

      // ✅ Enviar WhatsApp si está vencido y tiene celular
      if (cliente.celular) {
        const numeroFormateado = `549${cliente.celular.replace(/^54/, '')}@c.us`;
        const mensaje = `Hola ${cliente.nombre}, te recordamos que tu último pago fue hace más de 30 días. ¡Ponete al día con tu entrenamiento en JP Entrenamiento! 💪`;

        console.log(`📤 Enviando mensaje a ${numeroFormateado}`);

        try {
          await whatsappClient.sendMessage(numeroFormateado, mensaje);
          console.log(`✅ Mensaje enviado a ${cliente.nombre}`);
        } catch (err) {
          console.error(`❌ Error al enviar mensaje a ${cliente.nombre}:`, err.message);
        }
      }
    }
  });

  res.render('index', {
    clientes,
    resumen: {
      totalClientes,
      alDia,
      vencidos,
      totalRecaudado: totalRecaudadoHoy
    }
  });
};

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

// ===============================
// 📊 REPORTE DE PAGOS
// ===============================
exports.reportePagos = async (req, res) => {
  try {
    const clientes = await Cliente.find();

    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);

    const hace7Dias = new Date();
    hace7Dias.setDate(hoy.getDate() - 6);
    hace7Dias.setHours(0, 0, 0, 0);

    const desde = req.query.desde
      ? new Date(`${req.query.desde}T00:00:00.000Z`)
      : hace7Dias;

    const hasta = req.query.hasta
      ? new Date(`${req.query.hasta}T23:59:59.999Z`)
      : hoy;

    let pagosFiltrados = [];

    clientes.forEach(cliente => {
      const pagosValidos = cliente.pagos.filter(p => {
        const fechaPago = new Date(p.fecha);
        return fechaPago >= desde && fechaPago <= hasta;
      });

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
      desde: desde.toISOString().split('T')[0],
      hasta: hasta.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error en reportePagos:', error);
    res.status(500).send('Error al generar reporte');
  }
};
