const Gasto = require('../models/Gasto');

function getArgentinaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;

  return { year, month, day };
}

function getArgentinaDateString(date = new Date()) {
  const { year, month, day } = getArgentinaDateParts(date);
  return `${year}-${month}-${day}`;
}

function startOfArgentinaDay(dateStr) {
  return new Date(`${dateStr}T00:00:00.000-03:00`);
}

function endOfArgentinaDay(dateStr) {
  return new Date(`${dateStr}T23:59:59.999-03:00`);
}

exports.listarGastos = async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    let filtro = {};

    if (desde || hasta) {
      filtro.fecha = {};

      if (desde) {
        filtro.fecha.$gte = startOfArgentinaDay(desde);
      }

      if (hasta) {
        filtro.fecha.$lte = endOfArgentinaDay(hasta);
      }
    }

    const gastos = await Gasto.find(filtro).sort({ fecha: -1 }).limit(100);

    const totalFiltrado = gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0);

    const hoyArgentinaStr = getArgentinaDateString(new Date());
    const inicioHoy = startOfArgentinaDay(hoyArgentinaStr);
    const finHoy = endOfArgentinaDay(hoyArgentinaStr);

    const gastosHoy = await Gasto.find({
      fecha: { $gte: inicioHoy, $lte: finHoy }
    });

    const totalHoy = gastosHoy.reduce((acc, g) => acc + Number(g.monto || 0), 0);

    res.render('gastos', {
      gastos,
      totalHoy,
      totalFiltrado,
      desde: desde || '',
      hasta: hasta || ''
    });
  } catch (error) {
    console.error('Error al listar gastos:', error);
    res.status(500).send('Error al listar gastos');
  }
};

exports.guardarGasto = async (req, res) => {
  try {
    const {
      descripcion,
      categoria,
      monto,
      metodoPago,
      observacion,
      fecha
    } = req.body;

    const fechaFinal = fecha
      ? startOfArgentinaDay(fecha)
      : startOfArgentinaDay(getArgentinaDateString(new Date()));

    const nuevoGasto = new Gasto({
      descripcion,
      categoria,
      monto: Number(monto || 0),
      metodoPago,
      observacion,
      fecha: fechaFinal
    });

    await nuevoGasto.save();
    res.redirect('/gastos');
  } catch (error) {
    console.error('Error al guardar gasto:', error);
    res.status(500).send('Error al guardar gasto');
  }
};