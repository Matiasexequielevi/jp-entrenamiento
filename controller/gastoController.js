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

function normalizeGastoDateForCompare(fecha) {
  return getArgentinaDateString(new Date(fecha));
}

exports.listarGastos = async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    // Traemos más margen para evitar que registros viejos con distinta zona horaria queden afuera
    let consulta = {};
    if (desde || hasta) {
      consulta.fecha = {};

      if (desde) {
        const inicioAmplio = new Date(`${desde}T00:00:00.000Z`);
        consulta.fecha.$gte = inicioAmplio;
      }

      if (hasta) {
        const finAmplio = new Date(`${hasta}T23:59:59.999Z`);
        consulta.fecha.$lte = finAmplio;
      }
    }

    let gastos = await Gasto.find(consulta).sort({ fecha: -1 }).limit(300);

    // Filtro final por fecha argentina visible
    if (desde || hasta) {
      gastos = gastos.filter((gasto) => {
        const fechaArgentina = normalizeGastoDateForCompare(gasto.fecha);

        if (desde && fechaArgentina < desde) return false;
        if (hasta && fechaArgentina > hasta) return false;

        return true;
      });
    }

    const totalFiltrado = gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0);

    const hoyArgentinaStr = getArgentinaDateString(new Date());

    const gastosHoyRaw = await Gasto.find({
      fecha: {
        $gte: new Date(`${hoyArgentinaStr}T00:00:00.000Z`),
        $lte: new Date(`${hoyArgentinaStr}T23:59:59.999Z`)
      }
    }).limit(300);

    const gastosHoy = gastosHoyRaw.filter(
      (g) => normalizeGastoDateForCompare(g.fecha) === hoyArgentinaStr
    );

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