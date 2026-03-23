const Venta = require('../models/Venta');
const Producto = require('../models/Producto');

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
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    date: `${map.year}-${map.month}-${map.day}`,
    datetime: `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`
  };
}

function getArgentinaDayRange(date = new Date()) {
  const ar = getArgentinaDateParts(date);

  const start = new Date(Date.UTC(ar.year, ar.month - 1, ar.day, 3, 0, 0, 0));
  const end = new Date(Date.UTC(ar.year, ar.month - 1, ar.day + 1, 3, 0, 0, 0));

  return { start, end };
}

exports.listarVentas = async (req, res) => {
  try {
    const productos = await Producto.find({ activo: true }).sort({ nombre: 1 });
    const ventas = await Venta.find().sort({ fecha: -1 }).limit(50);

    const { start, end } = getArgentinaDayRange();

    const ventasHoy = await Venta.find({
      fecha: { $gte: start, $lt: end }
    });

    const totalHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total || 0), 0);

    res.render('ventas', {
      productos,
      ventas,
      totalHoy
    });
  } catch (error) {
    console.error('Error al listar ventas:', error);
    res.status(500).send('Error al listar ventas');
  }
};

exports.guardarVenta = async (req, res) => {
  try {
    const { productoId, cantidad, metodoPago, observacion } = req.body;

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).send('Producto no encontrado');
    }

    const cantidadNum = Number(cantidad);

    if (!cantidadNum || cantidadNum < 1) {
      return res.status(400).send('Cantidad inválida');
    }

    if (producto.stock < cantidadNum) {
      return res.status(400).send('Stock insuficiente');
    }

    const precioUnitario = Number(producto.precioVenta || 0);
    const total = precioUnitario * cantidadNum;

    const nuevaVenta = new Venta({
      producto: producto._id,
      nombreProducto: producto.nombre,
      cantidad: cantidadNum,
      precioUnitario,
      total,
      metodoPago,
      observacion,
      fecha: new Date()
    });

    await nuevaVenta.save();

    producto.stock = Number(producto.stock || 0) - cantidadNum;
    await producto.save();

    res.redirect('/ventas');
  } catch (error) {
    console.error('Error al guardar venta:', error);
    res.status(500).send('Error al guardar venta');
  }
};