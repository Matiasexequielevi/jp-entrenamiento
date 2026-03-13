const Producto = require('../models/Producto');

exports.listarProductos = async (req, res) => {
  try {
    const productos = await Producto.find().sort({ creadoEn: -1 });

    const totalProductos = productos.length;
    const stockBajo = productos.filter(p => p.stock <= p.stockMinimo).length;
    const stockTotal = productos.reduce((acc, p) => acc + Number(p.stock || 0), 0);

    res.render('productos', {
      productos,
      resumen: {
        totalProductos,
        stockBajo,
        stockTotal
      }
    });
  } catch (error) {
    console.error('Error al listar productos:', error);
    res.status(500).send('Error al listar productos');
  }
};

exports.formularioNuevo = (req, res) => {
  res.render('nuevo-producto');
};

exports.guardarProducto = async (req, res) => {
  try {
    const nuevoProducto = new Producto(req.body);
    await nuevoProducto.save();
    res.redirect('/productos');
  } catch (error) {
    console.error('Error al guardar producto:', error);
    res.status(500).send('Error al guardar producto');
  }
};

exports.formularioEditar = async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) {
      return res.status(404).send('Producto no encontrado');
    }

    res.render('editar-producto', { producto });
  } catch (error) {
    console.error('Error al cargar producto:', error);
    res.status(500).send('Error al cargar producto');
  }
};

exports.actualizarProducto = async (req, res) => {
  try {
    await Producto.findByIdAndUpdate(req.params.id, req.body);
    res.redirect('/productos');
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).send('Error al actualizar producto');
  }
};

exports.eliminarProducto = async (req, res) => {
  try {
    await Producto.findByIdAndDelete(req.params.id);
    res.redirect('/productos');
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).send('Error al eliminar producto');
  }
};