const Venta = require('../models/Venta');
const Producto = require('../models/Producto');

exports.listarVentas = async (req, res) => {
  try {
    const productos = await Producto.find({ activo: true }).sort({ nombre: 1 });
    const ventas = await Venta.find().sort({ fecha: -1 }).limit(50);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const ventasHoy = await Venta.find({
      fecha: { $gte: hoy, $lt: manana }
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
      observacion
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