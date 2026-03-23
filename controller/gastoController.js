const Gasto = require('../models/Gasto');

function getArgentinaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return { year, month, day };
}

function getArgentinaDateString(date = new Date()) {
  const { year, month, day } = getArgentinaDateParts(date);
  return `${year}-${month}-${day}`;
}

function startOfArgentinaDay(dateStr) {
  return new Date(`${dateStr}T00:00:00.000-03:00`);
}

async function migrarFechaLocalSiFalta() {
  const gastosSinFechaLocal = await Gasto.find({
    $or: [
      { fechaLocal: { $exists: false } },
      { fechaLocal: null },
      { fechaLocal: '' }
    ]
  });

  if (!gastosSinFechaLocal.length) return;

  for (const gasto of gastosSinFechaLocal) {
    gasto.fechaLocal = getArgentinaDateString(new Date(gasto.fecha));
    await gasto.save();
  }

  console.log(`✅ Gastos migrados automáticamente: ${gastosSinFechaLocal.length}`);
}

exports.listarGastos = async (req, res) => {
  try {
    await migrarFechaLocalSiFalta();

    const { desde, hasta } = req.query;

    const filtro = {};

    if (desde || hasta) {
      filtro.fechaLocal = {};
      if (desde) filtro.fechaLocal.$gte = desde;
      if (hasta) filtro.fechaLocal.$lte = hasta;
    }

    const gastos = await Gasto.find(filtro).sort({ fecha: -1 }).limit(500);

    const totalFiltrado = gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0);

    const hoyArgentinaStr = getArgentinaDateString(new Date());
    const gastosHoy = await Gasto.find({ fechaLocal: hoyArgentinaStr });
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

    const fechaLocal = fecha || getArgentinaDateString(new Date());
    const fechaFinal = startOfArgentinaDay(fechaLocal);

    const nuevoGasto = new Gasto({
      descripcion,
      categoria,
      monto: Number(monto || 0),
      metodoPago,
      observacion,
      fecha: fechaFinal,
      fechaLocal
    });

    await nuevoGasto.save();
    res.redirect('/gastos');
  } catch (error) {
    console.error('Error al guardar gasto:', error);
    res.status(500).send('Error al guardar gasto');
  }
};