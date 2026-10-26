const Cliente = require('../models/cliente');
const Producto = require('../models/Producto');
const Venta = require('../models/Venta');
const Gasto = require('../models/Gasto');
const MovimientoCuenta = require('../models/MovimientoCuenta');

// ========================================
// FECHAS DE ARGENTINA
// ========================================

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
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day + days, 12));

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

function redondear(valor) {
  return Math.round(Number(valor || 0) * 100) / 100;
}

function sumar(items, campo) {
  return redondear(
    items.reduce(
      (total, item) => total + Number(item[campo] || 0),
      0
    )
  );
}

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const fecha = new Date(`${valor}T12:00:00Z`);

  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor
  );
}

// ========================================
// INICIO - LISTAR CLIENTES
// ========================================

exports.listarClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ creadoEn: -1 });

    const hoyArgentinaStr = getArgentinaDateString();
    const hoySinHora = startOfArgentinaDay(hoyArgentinaStr);
    const manana = startOfArgentinaDay(
      addDaysToArgentinaDate(hoyArgentinaStr, 1)
    );

    const ahoraArgentina = new Date(
      `${hoyArgentinaStr}T12:00:00-03:00`
    );

    const diaHoy = ahoraArgentina.getDate();
    const mesHoy = ahoraArgentina.getMonth();

    const totalClientes = clientes.length;

    let alDia = 0;
    let vencidos = 0;
    let totalRecaudadoHoy = 0;

    const cumpleañeros = [];
    const proximosCumples = [];

    for (const cliente of clientes) {
      let ultimoPago = null;

      if (cliente.pagos && cliente.pagos.length > 0) {
        ultimoPago = cliente.pagos.reduce((ultimo, actual) => {
          return new Date(actual.fecha) > new Date(ultimo.fecha)
            ? actual
            : ultimo;
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
          cumpleañeros.push(
            `${cliente.nombre} ${cliente.apellido}`
          );
        } else {
          const esteAño = new Date(
            ahoraArgentina.getFullYear(),
            mesCumple,
            diaCumple
          );

          esteAño.setHours(0, 0, 0, 0);

          const diffDias = Math.ceil(
            (esteAño - hoySinHora) / (1000 * 60 * 60 * 24)
          );

          if (diffDias > 0 && diffDias <= 5) {
            proximosCumples.push(
              `${cliente.nombre} ${cliente.apellido} (${diaCumple}/${mesCumple + 1})`
            );
          }
        }
      }
    }

    clientes.sort((a, b) => {
      if (a.estadoPago === 'vencido' && b.estadoPago !== 'vencido') {
        return -1;
      }

      if (a.estadoPago !== 'vencido' && b.estadoPago === 'vencido') {
        return 1;
      }

      return 0;
    });

    // ========================================
    // RESUMEN FINANCIERO DEL DÍA
    // ========================================

    const [
      ventasHoy,
      gastosHoy,
      productos,
      pagosCuentaHoy
    ] = await Promise.all([
      Venta.find({
        fecha: {
          $gte: hoySinHora,
          $lt: manana
        }
      }),

      Gasto.find({
        fechaLocal: hoyArgentinaStr
      }),

      Producto.find(),

      MovimientoCuenta.find({
        tipo: 'pago',
        fecha: {
          $gte: hoySinHora,
          $lt: manana
        }
      })
    ]);

    // Todas las ventas, incluidas las fiadas
    const totalVendidoHoy = sumar(ventasHoy, 'total');

    // Solamente las ventas cobradas al momento
    const totalVentasHoy = redondear(
      ventasHoy
        .filter((venta) => venta.aCuenta !== true)
        .reduce(
          (total, venta) => total + Number(venta.total || 0),
          0
        )
    );

    // Pagos recibidos de cuentas corrientes
    const totalCobrosCuentaHoy = sumar(
      pagosCuentaHoy,
      'importe'
    );

    const totalGastosHoy = sumar(gastosHoy, 'monto');

    totalRecaudadoHoy = redondear(totalRecaudadoHoy);

    // Dinero efectivamente recibido
    const ingresosEfectivosHoy = redondear(
      totalRecaudadoHoy +
      totalVentasHoy +
      totalCobrosCuentaHoy
    );

    // Resultado de caja
    const gananciaNetaHoy = redondear(
      ingresosEfectivosHoy - totalGastosHoy
    );

    const stockBajo = productos.filter(
      (p) =>
        Number(p.stock || 0) <= Number(p.stockMinimo || 0)
    ).length;

    res.render('index', {
      clientes,

      resumen: {
        totalClientes,
        alDia,
        vencidos,

        totalRecaudado: totalRecaudadoHoy,

        ventasHoy: totalVentasHoy,
        totalVendidoHoy,
        cobrosCuentaHoy: totalCobrosCuentaHoy,
        ingresosEfectivosHoy,

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

// ========================================
// FORMULARIO NUEVO CLIENTE
// ========================================

exports.formularioNuevo = (req, res) => {
  res.render('nueva');
};

// ========================================
// GUARDAR CLIENTE
// ========================================

exports.guardarCliente = async (req, res) => {
  try {
    if (req.body.fechaNacimiento) {
      req.body.fechaNacimiento = new Date(
        req.body.fechaNacimiento
      );
    }

    const nuevoCliente = new Cliente(req.body);

    await nuevoCliente.save();

    res.redirect('/');
  } catch (error) {
    console.error('Error al guardar cliente:', error);
    res.status(500).send('Error al guardar cliente');
  }
};

// ========================================
// FORMULARIO EDITAR CLIENTE
// ========================================

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

// ========================================
// ACTUALIZAR CLIENTE
// ========================================

exports.actualizarCliente = async (req, res) => {
  try {
    if (req.body.fechaNacimiento) {
      req.body.fechaNacimiento = new Date(
        req.body.fechaNacimiento
      );
    }

    await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body
    );

    res.redirect('/editar/' + req.params.id);
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).send('Error al actualizar cliente');
  }
};

// ========================================
// ELIMINAR CLIENTE
// ========================================

exports.eliminarCliente = async (req, res) => {
  try {
    await Cliente.findByIdAndDelete(req.params.id);

    res.redirect('/');
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).send('Error al eliminar cliente');
  }
};

// ========================================
// AGREGAR PAGO DE CUOTA
// ========================================

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

// ========================================
// ELIMINAR PAGO DE CUOTA
// ========================================

exports.eliminarPago = async (req, res) => {
  const { clienteId, pagoId } = req.params;

  try {
    await Cliente.findByIdAndUpdate(clienteId, {
      $pull: {
        pagos: {
          _id: pagoId
        }
      }
    });

    res.redirect('/editar/' + clienteId);
  } catch (error) {
    console.error('Error al eliminar el pago:', error);
    res.status(500).send('Error al eliminar el pago');
  }
};

// ========================================
// REPORTES FINANCIEROS
// ========================================

exports.reportePagos = async (req, res) => {
  try {
    const clientes = await Cliente.find();

    const hoyArgentinaStr = getArgentinaDateString();
    const hace30DiasStr = addDaysToArgentinaDate(
      hoyArgentinaStr,
      -29
    );

    const desdeStr = req.query.desde || hace30DiasStr;
    const hastaStr = req.query.hasta || hoyArgentinaStr;

    if (
      !fechaValida(desdeStr) ||
      !fechaValida(hastaStr) ||
      desdeStr > hastaStr
    ) {
      return res.status(400).send(
        'Rango de fechas inválido'
      );
    }

    const desde = startOfArgentinaDay(desdeStr);
    const hasta = endOfArgentinaDay(hastaStr);

    // ========================================
    // CUOTAS DEL PERÍODO
    // ========================================

    const pagosFiltrados = [];

    clientes.forEach((cliente) => {
      (cliente.pagos || []).forEach((p) => {
        const fechaPago = new Date(p.fecha);

        if (fechaPago >= desde && fechaPago <= hasta) {
          pagosFiltrados.push({
            tipo: 'Cuota',
            nombre: `${cliente.nombre} ${cliente.apellido}`,
            fecha: fechaPago,
            monto: Number(p.monto || 0),
            fechaLocal:
              getArgentinaDateStringFromStoredDate(p.fecha)
          });
        }
      });
    });

    // ========================================
    // VENTAS DEL PERÍODO
    // ========================================

    const ventasFiltradas = await Venta.find({
      fecha: {
        $gte: desde,
        $lte: hasta
      }
    }).sort({ fecha: -1 });

    const ventasDetalle = ventasFiltradas.map(
      (venta) => ({
        tipo:
          venta.aCuenta === true
            ? 'Venta fiada'
            : 'Venta',

        nombre: venta.nombreProducto || 'Producto',
        fecha: new Date(venta.fecha),
        fechaLocal: getArgentinaDateString(venta.fecha),
        monto: Number(venta.total || 0),
        metodoPago:
          venta.metodoPago || 'No especificado',
        cantidad: Number(venta.cantidad || 0),
        aCuenta: venta.aCuenta === true
      })
    );

    const ventasInmediatas = ventasDetalle.filter(
      (venta) => !venta.aCuenta
    );

    const ventasFiadas = ventasDetalle.filter(
      (venta) => venta.aCuenta
    );

    // ========================================
    // COBROS DE CUENTAS CORRIENTES
    // ========================================

    const pagosCuenta = await MovimientoCuenta.find({
      tipo: 'pago',
      fecha: {
        $gte: desde,
        $lte: hasta
      }
    })
      .populate('alumno', 'nombre apellido')
      .sort({ fecha: -1 });

    const cobrosDetalle = pagosCuenta.map(
      (pago) => ({
        tipo: 'Cobro cuenta',

        nombre: pago.alumno
          ? `${pago.alumno.nombre} ${pago.alumno.apellido}`
          : 'Alumno',

        fecha: new Date(pago.fecha),
        fechaLocal: getArgentinaDateString(pago.fecha),
        monto: Number(pago.importe || 0),
        metodoPago:
          pago.medio || 'No especificado',
        descripcion:
          pago.descripcion || 'Pago de cuenta corriente'
      })
    );

    // ========================================
    // GASTOS DEL PERÍODO
    // ========================================

    const gastosFiltrados = await Gasto.find({
      fechaLocal: {
        $gte: desdeStr,
        $lte: hastaStr
      }
    }).sort({ fecha: -1 });

    const gastosDetalle = gastosFiltrados.map(
      (gasto) => ({
        tipo: 'Gasto',
        nombre: gasto.descripcion || 'Gasto',
        fecha: new Date(gasto.fecha),
        fechaLocal: gasto.fechaLocal || '',
        monto: Number(gasto.monto || 0),
        categoria: gasto.categoria || 'Otros',
        metodoPago:
          gasto.metodoPago || 'No especificado'
      })
    );

    // ========================================
    // TOTALES DEL PERÍODO
    // ========================================

    const totalCuotas = sumar(
      pagosFiltrados,
      'monto'
    );

    // Todas las ventas, incluidas las fiadas
    const totalVentas = sumar(
      ventasDetalle,
      'monto'
    );

    const totalVentasInmediatas = sumar(
      ventasInmediatas,
      'monto'
    );

    const totalVentasFiadas = sumar(
      ventasFiadas,
      'monto'
    );

    const totalCobrosCuenta = sumar(
      cobrosDetalle,
      'monto'
    );

    const totalGastos = sumar(
      gastosDetalle,
      'monto'
    );

    // Dinero realmente cobrado
    const totalIngresos = redondear(
      totalCuotas +
      totalVentasInmediatas +
      totalCobrosCuenta
    );

    // Resultado de caja
    const gananciaNeta = redondear(
      totalIngresos - totalGastos
    );

    // ========================================
    // HISTORIAL DE MOVIMIENTOS
    // ========================================

    const movimientos = [
      ...pagosFiltrados,
      ...ventasDetalle,
      ...cobrosDetalle,
      ...gastosDetalle
    ].sort(
      (a, b) =>
        new Date(b.fecha) - new Date(a.fecha)
    );

    // ========================================
    // RESUMEN DEL MES ACTUAL
    // ========================================

    const { inicioMes, finMes } =
      getMonthRangeArgentina();

    const inicioMesStr =
      getArgentinaDateString(inicioMes);

    const finMesStr =
      getArgentinaDateString(finMes);

    const pagosMes = [];

    clientes.forEach((cliente) => {
      (cliente.pagos || []).forEach((p) => {
        const fechaPago = new Date(p.fecha);

        if (
          fechaPago >= inicioMes &&
          fechaPago <= finMes
        ) {
          pagosMes.push({
            monto: Number(p.monto || 0)
          });
        }
      });
    });

    const [
      ventasMes,
      gastosMes,
      cobrosMes
    ] = await Promise.all([
      Venta.find({
        fecha: {
          $gte: inicioMes,
          $lte: finMes
        }
      }),

      Gasto.find({
        fechaLocal: {
          $gte: inicioMesStr,
          $lte: finMesStr
        }
      }),

      MovimientoCuenta.find({
        tipo: 'pago',
        fecha: {
          $gte: inicioMes,
          $lte: finMes
        }
      })
    ]);

    const totalCuotasMes = sumar(
      pagosMes,
      'monto'
    );

    const totalVentasMes = sumar(
      ventasMes,
      'total'
    );

    const totalVentasInmediatasMes = redondear(
      ventasMes
        .filter((venta) => venta.aCuenta !== true)
        .reduce(
          (total, venta) =>
            total + Number(venta.total || 0),
          0
        )
    );

    const totalCobrosCuentaMes = sumar(
      cobrosMes,
      'importe'
    );

    const totalGastosMes = sumar(
      gastosMes,
      'monto'
    );

    const ingresosEfectivosMes = redondear(
      totalCuotasMes +
      totalVentasInmediatasMes +
      totalCobrosCuentaMes
    );

    const gananciaNetaMes = redondear(
      ingresosEfectivosMes - totalGastosMes
    );

    // ========================================
    // SALDO TOTAL DE CUENTAS CORRIENTES
    // ========================================

    const saldos = await MovimientoCuenta.aggregate([
      {
        $group: {
          _id: '$alumno',

          total: {
            $sum: {
              $cond: [
                { $eq: ['$tipo', 'cargo'] },
                '$importe',
                {
                  $multiply: [
                    '$importe',
                    -1
                  ]
                }
              ]
            }
          }
        }
      }
    ]);

    const totalPendiente = redondear(
      saldos.reduce(
        (total, cuenta) =>
          total +
          Math.max(
            0,
            Number(cuenta.total || 0)
          ),
        0
      )
    );

    // ========================================
    // PRODUCTOS MÁS VENDIDOS
    // ========================================

    const mapaProductos = {};

    ventasFiltradas.forEach((venta) => {
      const nombre =
        venta.nombreProducto || 'Producto';

      if (!mapaProductos[nombre]) {
        mapaProductos[nombre] = {
          nombre,
          cantidad: 0,
          total: 0
        };
      }

      mapaProductos[nombre].cantidad +=
        Number(venta.cantidad || 0);

      mapaProductos[nombre].total +=
        Number(venta.total || 0);
    });

    const productosMasVendidos =
      Object.values(mapaProductos)
        .sort(
          (a, b) =>
            b.cantidad - a.cantidad
        )
        .slice(0, 5);

    // ========================================
    // RENDERIZAR REPORTE
    // ========================================

    res.render('reportes', {
      pagos: pagosFiltrados,
      ventas: ventasDetalle,
      gastos: gastosDetalle,
      movimientos,

      total: totalIngresos,

      totalCuotas,
      totalVentas,
      totalVentasInmediatas,
      totalVentasFiadas,
      totalCobrosCuenta,
      totalPendiente,

      totalGastos,
      totalIngresos,
      gananciaNeta,

      totalCuotasMes,
      totalVentasMes,
      totalVentasInmediatasMes,
      totalCobrosCuentaMes,
      totalGastosMes,
      ingresosEfectivosMes,
      gananciaNetaMes,

      cantidadPagos: pagosFiltrados.length,
      cantidadVentas: ventasDetalle.length,
      cantidadGastos: gastosDetalle.length,
      cantidadCobrosCuenta: cobrosDetalle.length,
      cantidadMovimientos: movimientos.length,

      productosMasVendidos,

      desde: desdeStr,
      hasta: hastaStr
    });
  } catch (error) {
    console.error(
      'Error en reportePagos:',
      error
    );

    res.status(500).send(
      'Error al generar reporte'
    );
  }
};