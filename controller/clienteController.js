const Cliente = require('../models/cliente');
const Producto = require('../models/Producto');
const Venta = require('../models/Venta');
const Gasto = require('../models/Gasto');

function getArgentinaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
    date: `${map.year}-${map.month}-${map.day}`,
    datetime: `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`
  };
}

function getArgentinaDateString(date = new Date()) {
  return getArgentinaDateParts(date).date;
}

function startOfArgentinaDay(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
}

function endOfArgentinaDay(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999));
}

function getArgentinaDateStringFromStoredDate(dateValue) {
  if (!dateValue) return '';
  return getArgentinaDateString(new Date(dateValue));
}

function addDaysToArgentinaDate(dateStr, days) {
  const base = startOfArgentinaDay(dateStr);
  base.setUTCDate(base.getUTCDate() + days);
  return getArgentinaDateString(base);
}

function getMonthRangeArgentina(date = new Date()) {
  const parts = getArgentinaDateParts(date);
  const inicioMesStr = `${parts.year}-${parts.month}-01`;

  const nextMonth =
    Number(parts.month) === 12
      ? `${String(Number(parts.year) + 1)}-01-01`
      : `${parts.year}-${String(Number(parts.month) + 1).padStart(2, '0')}-01`;

  const inicioMes = startOfArgentinaDay(inicioMesStr);
  const finMesExclusivo = startOfArgentinaDay(nextMonth);

  return {
    inicioMes,
    finMes: new Date(finMesExclusivo.getTime() - 1),
    inicioMesStr
  };
}

// Mostrar todos los clientes con resumen real de pagos + ventas + gastos + stock
exports.listarClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ creadoEn: -1 });

    const hoyArgentinaStr = getArgentinaDateString();
    const hoySinHora = startOfArgentinaDay(hoyArgentinaStr);
    const manana = startOfArgentinaDay(addDaysToArgentinaDate(hoyArgentinaStr, 1));

    const ahoraArgentina = new Date(`${hoyArgentinaStr}T12:00:00-03:00`);
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

          if (fechaPago >= hoySinHora && fechaPago < manana) {
            totalRecaudadoHoy += Number(p.monto || 0);
          }
        });
      }

      const hace34Dias = new Date(hoySinHora);
      hace34Dias.setUTCDate(hace34Dias.getUTCDate() - 34);

      if (ultimoPago && new Date(ultimoPago.fecha) >= hace34Dias) {
        alDia++;
        cliente.estadoPago = 'aldia';
      } else {
        vencidos++;
        cliente.estadoPago = 'vencido';
      }

      if (cliente.fechaNacimiento) {
        const cumple = new Date(cliente.fechaNacimiento);
        const diaCumple = cumple.getDate();
        const mesCumple = cumple.getMonth();

        if (diaCumple === diaHoy && mesCumple === mesHoy) {
          cumpleañeros.push(`${cliente.nombre} ${cliente.apellido}`);
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

    clientes.sort((a, b) => {
      if (a.estadoPago === 'vencido' && b.estadoPago !== 'vencido') return -1;
      if (a.estadoPago !== 'vencido' && b.estadoPago === 'vencido') return 1;
      return 0;
    });

    const [ventasHoy, gastosHoy, productos] = await Promise.all([
      Venta.find({ fecha: { $gte: hoySinHora, $lt: manana } }),
      Gasto.find({ fechaLocal: hoyArgentinaStr }),
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

    const fechaLocal = fecha || getArgentinaDateString();
    const fechaFinal = startOfArgentinaDay(fechaLocal);

    cliente.pagos.push({
      fecha: fechaFinal,
      monto: Number(monto || 0)
    });

    cliente.fechaPago = fechaFinal;
    cliente.notificado = false;
    cliente.ultimoRecordatorioEnviado = null;

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

    const hoyArgentinaStr = getArgentinaDateString();
    const hace30DiasStr = addDaysToArgentinaDate(hoyArgentinaStr, -29);

    const desdeStr = req.query.desde || hace30DiasStr;
    const hastaStr = req.query.hasta || hoyArgentinaStr;

    const desde = startOfArgentinaDay(desdeStr);
    const hasta = endOfArgentinaDay(hastaStr);

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
          monto: Number(p.monto || 0),
          fechaLocal: getArgentinaDateStringFromStoredDate(p.fecha)
        });
      });
    });

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

    const gastosFiltrados = await Gasto.find({
      fechaLocal: { $gte: desdeStr, $lte: hastaStr }
    }).sort({ fecha: -1 });

    const gastosDetalle = gastosFiltrados.map((gasto) => ({
      tipo: 'Gasto',
      nombre: gasto.descripcion || 'Gasto',
      fecha: new Date(gasto.fecha),
      fechaLocal: gasto.fechaLocal || '',
      monto: Number(gasto.monto || 0),
      categoria: gasto.categoria || 'Otros',
      metodoPago: gasto.metodoPago || 'No especificado'
    }));

    const totalCuotas = pagosFiltrados.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const totalVentas = ventasDetalle.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const totalGastos = gastosDetalle.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const totalIngresos = totalCuotas + totalVentas;
    const gananciaNeta = totalIngresos - totalGastos;

    const movimientos = [
      ...pagosFiltrados,
      ...ventasDetalle,
      ...gastosDetalle
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const { inicioMes, finMes } = getMonthRangeArgentina();

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
      fechaLocal: {
        $gte: getArgentinaDateString(inicioMes),
        $lte: getArgentinaDateString(finMes)
      }
    });

    const totalCuotasMes = pagosMes.reduce((acc, monto) => acc + Number(monto || 0), 0);
    const totalVentasMes = ventasMes.reduce((acc, venta) => acc + Number(venta.total || 0), 0);
    const totalGastosMes = gastosMes.reduce((acc, gasto) => acc + Number(gasto.monto || 0), 0);
    const gananciaNetaMes = totalCuotasMes + totalVentasMes - totalGastosMes;

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

    res.render('reportes', {
      pagos: pagosFiltrados,
      ventas: ventasDetalle,
      gastos: gastosDetalle,
      movimientos,

      total: totalIngresos,
      totalCuotas,
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

      desde: desdeStr,
      hasta: hastaStr
    });
  } catch (error) {
    console.error('Error en reportePagos:', error);
    res.status(500).send('Error al generar reporte');
  }
};