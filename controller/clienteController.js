const Cliente = require('../models/cliente');
const Producto = require('../models/Producto');
const Venta = require('../models/Venta');
const Gasto = require('../models/Gasto');
const whatsappClient = require('../services/whatsapp');

// Mostrar todos los clientes con resumen real de pagos + ventas + gastos + stock
exports.listarClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ creadoEn: -1 });

    // Día actual en horario Argentina
    const ahora = new Date();
    const ahoraArgentina = new Date(
      ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    );

    const hoySinHora = new Date(ahoraArgentina);
    hoySinHora.setHours(0, 0, 0, 0);

    const manana = new Date(hoySinHora);
    manana.setDate(manana.getDate() + 1);

    const diaHoy = ahoraArgentina.getDate();
    const mesHoy = ahoraArgentina.getMonth();

    let totalClientes = clientes.length;
    let alDia = 0;
    let vencidos = 0;
    let totalRecaudadoHoy = 0;
    let cumpleañeros = [];
    let proximosCumples = [];

    for (const cliente of clientes) {
      let ultimoPago = null;

      if (cliente.pagos && cliente.pagos.length > 0) {
        ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
          return new Date(actual.fecha) > new Date(ultimo.fecha) ? actual : ultimo;
        });

        cliente.pagos.forEach((p) => {
          const fechaPago = new Date(p.fecha);
          fechaPago.setHours(0, 0, 0, 0);

          if (fechaPago.getTime() === hoySinHora.getTime()) {
            totalRecaudadoHoy += Number(p.monto || 0);
          }
        });
      }

      const hace34Dias = new Date(ahoraArgentina);
      hace34Dias.setDate(hace34Dias.getDate() - 34);
      hace34Dias.setHours(0, 0, 0, 0);

      if (ultimoPago && new Date(ultimoPago.fecha) >= hace34Dias) {
        alDia++;
        cliente.estadoPago = 'aldia';
      } else {
        vencidos++;
        cliente.estadoPago = 'vencido';

        if (
          whatsappClient &&
          whatsappClient.client &&
          whatsappClient.client.clientReady &&
          cliente.celular &&
          !cliente.notificado &&
          ultimoPago &&
          new Date(ultimoPago.fecha) < hace34Dias
        ) {
          const mensaje = `Hola ${cliente.nombre}, te recordamos que tu último pago fue hace más de 30 días. ¡Ponete al día con tu entrenamiento en JP Entrenamiento! 💪`;

          try {
            let numero = String(cliente.celular).replace(/\D/g, '');
            if (!numero.startsWith('549')) {
              numero = '549' + numero;
            }

            await whatsappClient.sendMessage(numero, mensaje);
            console.log(`📤 Mensaje enviado a ${cliente.nombre}`);
            cliente.notificado = true;
            await cliente.save();
          } catch (error) {
            console.error(`❌ Error al enviar mensaje a ${cliente.nombre}:`, error.message);
          }
        }
      }

      // Cumpleaños
      if (cliente.fechaNacimiento) {
        const cumple = new Date(cliente.fechaNacimiento);
        const diaCumple = cumple.getDate();
        const mesCumple = cumple.getMonth();

        if (diaCumple === diaHoy && mesCumple === mesHoy) {
          cumpleañeros.push(cliente.nombre + ' ' + cliente.apellido);
        } else {
          const esteAño = new Date(ahoraArgentina.getFullYear(), mesCumple, diaCumple);
          esteAño.setHours(0, 0, 0, 0);

          const diffDias = Math.ceil((esteAño - hoySinHora) / (1000 * 60 * 60 * 24));

          if (diffDias > 0 && diffDias <= 5) {
            proximosCumples.push(
              `${cliente.nombre} ${cliente.apellido} (${diaCumple}/${mesCumple + 1})`
            );
          }
        }
      }
    }

    // Ordenar: vencidos primero
    clientes.sort((a, b) => {
      if (a.estadoPago === 'vencido' && b.estadoPago !== 'vencido') return -1;
      if (a.estadoPago !== 'vencido' && b.estadoPago === 'vencido') return 1;
      return 0;
    });

    // Ventas, gastos y productos
    const [ventasHoy, gastosHoy, productos] = await Promise.all([
      Venta.find({ fecha: { $gte: hoySinHora, $lt: manana } }),
      Gasto.find({ fecha: { $gte: hoySinHora, $lt: manana } }),
      Producto.find()
    ]);

    const totalVentasHoy = ventasHoy.reduce((acc, venta) => acc + Number(venta.total || 0), 0);
    const totalGastosHoy = gastosHoy.reduce((acc, gasto) => acc + Number(gasto.monto || 0), 0);
    const gananciaNetaHoy = totalRecaudadoHoy + totalVentasHoy - totalGastosHoy;
    const stockBajo = productos.filter(
      (p) => Number(p.stock || 0) <= Number(p.stockMinimo || 0)
    ).length;

    res.render('index', {
      clientes,
      resumen: {
        totalClientes,
        alDia,
        vencidos,
        totalRecaudado: totalRecaudadoHoy,
        ventasHoy: totalVentasHoy,
        gastosHoy: totalGastosHoy,
        gananciaNetaHoy,
        stockBajo
      },
      cumpleañeros,
      proximosCumples
    });
  } catch (error) {
    console.error('Error al listar clientes:', error);
    res.status(500).send('Error al cargar el inicio');
  }
};

exports.formularioNuevo = (req, res) => {
  res.render('nueva');
};

exports.guardarCliente = async (req, res) => {
  try {
    if (req.body.fechaNacimiento) {
      req.body.fechaNacimiento = new Date(req.body.fechaNacimiento);
    }

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

    if (!cliente) {
      return res.status(404).send('Cliente no encontrado');
    }

    res.render('editar', { cliente });
  } catch (error) {
    console.error('Error al cargar cliente:', error);
    res.status(500).send('Error al cargar cliente');
  }
};

exports.actualizarCliente = async (req, res) => {
  try {
    if (req.body.fechaNacimiento) {
      req.body.fechaNacimiento = new Date(req.body.fechaNacimiento);
    }

    await Cliente.findByIdAndUpdate(req.params.id, req.body);
    res.redirect('/editar/' + req.params.id);
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).send('Error al actualizar cliente');
  }
};

exports.eliminarCliente = async (req, res) => {
  try {
    await Cliente.findByIdAndDelete(req.params.id);
    res.redirect('/');
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).send('Error al eliminar cliente');
  }
};

exports.agregarPago = async (req, res) => {
  const { fecha, monto } = req.body;

  try {
    const cliente = await Cliente.findById(req.params.id);

    if (!cliente) {
      return res.status(404).send('Cliente no encontrado');
    }

    cliente.pagos.push({
      fecha,
      monto: Number(monto || 0)
    });

    cliente.notificado = false;
    await cliente.save();

    res.redirect('/editar/' + req.params.id);
  } catch (error) {
    console.error('Error al agregar pago:', error);
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
    console.error('Error al eliminar el pago:', error);
    res.status(500).send('Error al eliminar el pago');
  }
};

exports.reportePagos = async (req, res) => {
  try {
    const clientes = await Cliente.find();

    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);

    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 29);
    hace30Dias.setHours(0, 0, 0, 0);

    const desde = req.query.desde
      ? new Date(`${req.query.desde}T00:00:00.000Z`)
      : hace30Dias;

    const hasta = req.query.hasta
      ? new Date(`${req.query.hasta}T23:59:59.999Z`)
      : hoy;

    // =========================
    // PAGOS DE CUOTAS
    // =========================
    let pagosFiltrados = [];

    clientes.forEach((cliente) => {
      const pagosValidos = (cliente.pagos || []).filter((p) => {
        const fechaPago = new Date(p.fecha);
        return fechaPago >= desde && fechaPago <= hasta;
      });

      pagosValidos.forEach((p) => {
        pagosFiltrados.push({
          tipo: 'Cuota',
          nombre: `${cliente.nombre} ${cliente.apellido}`,
          fecha: new Date(p.fecha),
          monto: Number(p.monto || 0)
        });
      });
    });

    // =========================
    // VENTAS DE PRODUCTOS
    // =========================
    const ventasFiltradas = await Venta.find({
      fecha: { $gte: desde, $lte: hasta }
    }).sort({ fecha: -1 });

    const ventasDetalle = ventasFiltradas.map((venta) => ({
      tipo: 'Venta',
      nombre: venta.nombreProducto || 'Producto',
      fecha: new Date(venta.fecha),
      monto: Number(venta.total || 0),
      metodoPago: venta.metodoPago || 'No especificado',
      cantidad: Number(venta.cantidad || 0)
    }));

    // =========================
    // GASTOS
    // =========================
    const gastosFiltrados = await Gasto.find({
      fecha: { $gte: desde, $lte: hasta }
    }).sort({ fecha: -1 });

    const gastosDetalle = gastosFiltrados.map((gasto) => ({
      tipo: 'Gasto',
      nombre: gasto.descripcion || 'Gasto',
      fecha: new Date(gasto.fecha),
      monto: Number(gasto.monto || 0),
      categoria: gasto.categoria || 'Otros',
      metodoPago: gasto.metodoPago || 'No especificado'
    }));

    // =========================
    // TOTALES
    // =========================
    const totalCuotas = pagosFiltrados.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const totalVentas = ventasDetalle.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const totalGastos = gastosDetalle.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const totalIngresos = totalCuotas + totalVentas;
    const gananciaNeta = totalIngresos - totalGastos;

    // =========================
    // MOVIMIENTOS COMBINADOS
    // =========================
    const movimientos = [
      ...pagosFiltrados,
      ...ventasDetalle,
      ...gastosDetalle
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // =========================
    // RESUMEN MENSUAL DEL MES ACTUAL
    // =========================
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0, 0);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);

    let pagosMes = [];
    clientes.forEach((cliente) => {
      const pagosValidosMes = (cliente.pagos || []).filter((p) => {
        const fechaPago = new Date(p.fecha);
        return fechaPago >= inicioMes && fechaPago <= finMes;
      });

      pagosValidosMes.forEach((p) => {
        pagosMes.push(Number(p.monto || 0));
      });
    });

    const ventasMes = await Venta.find({
      fecha: { $gte: inicioMes, $lte: finMes }
    });

    const gastosMes = await Gasto.find({
      fecha: { $gte: inicioMes, $lte: finMes }
    });

    const totalCuotasMes = pagosMes.reduce((acc, monto) => acc + Number(monto || 0), 0);
    const totalVentasMes = ventasMes.reduce((acc, venta) => acc + Number(venta.total || 0), 0);
    const totalGastosMes = gastosMes.reduce((acc, gasto) => acc + Number(gasto.monto || 0), 0);
    const gananciaNetaMes = totalCuotasMes + totalVentasMes - totalGastosMes;

    // =========================
    // PRODUCTOS MÁS VENDIDOS
    // =========================
    const mapaProductos = {};

    ventasFiltradas.forEach((venta) => {
      const nombre = venta.nombreProducto || 'Producto';
      if (!mapaProductos[nombre]) {
        mapaProductos[nombre] = {
          nombre,
          cantidad: 0,
          total: 0
        };
      }

      mapaProductos[nombre].cantidad += Number(venta.cantidad || 0);
      mapaProductos[nombre].total += Number(venta.total || 0);
    });

    const productosMasVendidos = Object.values(mapaProductos)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // =========================
    // RENDER
    // =========================
    res.render('reportes', {
      pagos: pagosFiltrados,
      ventas: ventasDetalle,
      gastos: gastosDetalle,
      movimientos,

total: totalIngresos,      totalCuotas,
      totalVentas,
      totalGastos,
      totalIngresos,
      gananciaNeta,

      totalCuotasMes,
      totalVentasMes,
      totalGastosMes,
      gananciaNetaMes,

      cantidadPagos: pagosFiltrados.length,
      cantidadVentas: ventasDetalle.length,
      cantidadGastos: gastosDetalle.length,
      cantidadMovimientos: movimientos.length,

      productosMasVendidos,

      desde: desde.toISOString().split('T')[0],
      hasta: hasta.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error en reportePagos:', error);
    res.status(500).send('Error al generar reporte');
  }
};