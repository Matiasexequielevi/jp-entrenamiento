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

    const hoyArgentinaStr = getArgentinaDateString();
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

    const fechaLocal = fecha || getArgentinaDateString();
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