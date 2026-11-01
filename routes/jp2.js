const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const multer = require('multer');

const Cliente = require('../models/cliente');
const Profesor = require('../models/Profesor');
const Rutina = require('../models/Rutina');
const Producto = require('../models/Producto');
const Venta = require('../models/Venta');
const Mov = require('../models/MovimientoCuenta');
const Novedad = require('../models/Novedad');
const Config = require('../models/ConfiguracionGym');
const MensajeProfesor = require('../models/MensajeProfesor');
const ProgresoEntrenamiento = require('../models/ProgresoEntrenamiento');

const admin = (req, res, next) =>
  req.session.rol === 'dueno'
    ? next()
    : res.status(403).send('Acceso restringido');

const staff = (req, res, next) =>
  ['dueno', 'profesor'].includes(req.session.rol)
    ? next()
    : res.redirect('/acceso');

const alumno = (req, res, next) =>
  req.session.rol === 'alumno'
    ? next()
    : res.redirect('/acceso');

const str = x => String(x ?? '').trim();
const validId = x => /^[a-f\d]{24}$/i.test(str(x));

const err = (res, msg) =>
  res.status(400).render('jp2/message', {
    titulo: 'Revisá los datos',
    mensaje: msg,
    volver: 'javascript:history.back()'
  });

const saldo = async id => {
  const movs = await Mov.find({ alumno: id })
    .sort({ fecha: -1 })
    .lean();

  return {
    movs,
    total: Math.round(
      movs.reduce(
        (a, m) =>
          a + (m.tipo === 'cargo' ? m.importe : -m.importe),
        0
      ) * 100
    ) / 100
  };
};

async function config() {
  return await Config.findById('principal') ||
    new Config({ _id: 'principal' });
}

function fechaVenc(c, dias = 31) {
  const f = c.fechaPago || c.fechaInicio;
  if (!f) return null;

  const d = new Date(f);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

function render(res, name, data = {}) {
  res.render('jp2/' + name, data);
}

// ========================================
// ACCESO
// ========================================

router.get('/acceso', (req, res) => {
  render(res, 'access', {
    error: req.query.error || ''
  });
});

router.post('/acceso', async (req, res, next) => {
  try {
    const tipo = str(req.body.tipo);
    const usuario = str(req.body.usuario);
    const clave = str(req.body.clave);

    let obj;

    if (tipo === 'alumno') {
      if (!/^\d{7,9}$/.test(usuario)) {
        return res.redirect('/acceso?error=1');
      }

      obj = await Cliente.findOne({
        dni: usuario,
        accesoApp: true
      }).select('+passwordHash');

    } else if (tipo === 'profesor') {
      obj = await Profesor.findOne({
        usuario: usuario.toLowerCase(),
        activo: true
      }).select('+passwordHash');

    } else {
      return res.redirect('/acceso?error=1');
    }

    if (
      !obj?.passwordHash ||
      !await bcrypt.compare(clave, obj.passwordHash)
    ) {
      return res.redirect('/acceso?error=1');
    }

    req.session.regenerate(e => {
      if (e) return next(e);

      req.session.rol = tipo;
      req.session.uid = String(obj._id);
      req.session.actor = tipo === 'alumno'
        ? obj.nombre + ' ' + obj.apellido
        : obj.nombre;

      req.session.save(() => {
        res.redirect(
          tipo === 'alumno' ? '/mi-app' : '/profesor'
        );
      });
    });

  } catch (e) {
    next(e);
  }
});

// ========================================
// APP DEL ALUMNO
// ========================================

router.get('/mi-app', alumno, async (req, res, next) => {
  try {
    const c = await Cliente.findById(req.session.uid);

    if (!c) return res.redirect('/logout');

    const [rutinas, novedades, conf, cuenta] = await Promise.all([
      Rutina.find({ alumno: c._id })
        .sort({ actualizada: -1, _id: -1 })
        .lean(),

      Novedad.find({ activa: true })
        .sort({ fecha: -1 })
        .limit(12)
        .lean(),

      config(),
      saldo(c._id)
    ]);

    // Una sola rutina visible por día.
    // Si hay duplicados históricos, usamos la más reciente.
    const rutinasUnicas = rutinas.filter((r, i) =>
      rutinas.findIndex(x => x.dia === r.dia) === i
    );

    render(res, 'student', {
      c,
      rutinas: rutinasUnicas,
      novedades,
      conf,
      cuenta,
      venc: fechaVenc(c, conf.duracionCuota)
    });

  } catch (e) {
    next(e);
  }
});

router.post('/mi-app/clave', alumno, async (req, res, next) => {
  try {
    if (str(req.body.nueva).length < 6) {
      return err(
        res,
        'La contraseña debe tener al menos 6 caracteres'
      );
    }

    const c = await Cliente.findById(
      req.session.uid
    ).select('+passwordHash');

    if (
      !await bcrypt.compare(
        str(req.body.actual),
        c.passwordHash
      )
    ) {
      return err(res, 'Contraseña actual incorrecta');
    }

    c.passwordHash = await bcrypt.hash(
      str(req.body.nueva),
      12
    );

    c.cambiarClave = false;

    await c.save();

    res.redirect('/mi-app');

  } catch (e) {
    next(e);
  }
});

// ========================================
// PANEL DEL PROFESOR
// ========================================

router.get('/profesor', staff, async (req, res, next) => {
  try {
    const [
      clientes,
      productos,
      profesores,
      rutinas
    ] = await Promise.all([

      Cliente.find()
        .select('nombre apellido dni fechaPago plan')
        .sort({ apellido: 1 })
        .lean(),

      Producto.find({ activo: true })
        .sort({ nombre: 1 })
        .lean(),

      Profesor.find()
        .select('-passwordHash')
        .lean(),

      Rutina.find()
        .populate('alumno', 'nombre apellido')
        .sort({ actualizada: -1, _id: -1 })
        .lean()
    ]);

    // Evita mostrar rutinas duplicadas.
    const rutinasUnicas = rutinas.filter((r, i) => {
      if (!r.alumno) return false;

      return rutinas.findIndex(x =>
        x.alumno &&
        String(x.alumno._id) === String(r.alumno._id) &&
        x.dia === r.dia
      ) === i;
    });

  
    // ========================================
    // MOSTRAR PANEL DEL PROFESOR
    // ========================================
    render(res, 'teacher', {
      clientes,
      productos,
      profesores,
      rutinas: rutinasUnicas,

      importado: Math.max(
        0,
        Number(req.query.importado) || 0
      ),

      mensajeEnviado: req.query.mensaje === 'enviado'
    });

  } catch (e) {
    console.error('ERROR EN PANEL PROFESOR:', e);
    next(e);
  }
});

// ========================================
// GESTIÓN DEL GIMNASIO
// ========================================

router.get('/gestion', admin, async (req, res, next) => {
  try {
    const [
      clientes,
      profesores,
      novedades,
      conf,
      cuentas
    ] = await Promise.all([

      Cliente.find()
        .sort({ apellido: 1 })
        .lean(),

      Profesor.find().lean(),

      Novedad.find()
        .sort({ fecha: -1 })
        .lean(),

      config(),

      Mov.aggregate([
        {
          $group: {
            _id: '$alumno',
            total: {
              $sum: {
                $cond: [
                  { $eq: ['$tipo', 'cargo'] },
                  '$importe',
                  { $multiply: ['$importe', -1] }
                ]
              }
            }
          }
        }
      ])
    ]);

    render(res, 'manage', {
      clientes,
      profesores,
      novedades,
      conf,
      cuentas
    });

  } catch (e) {
    next(e);
  }
});

router.post('/gestion/acceso', admin, async (req, res, next) => {
  try {
    const id = str(req.body.alumnoId);
    const dni = str(req.body.dni).replace(/\D/g, '');
    const clave = str(req.body.clave);

    if (
      !validId(id) ||
      !/^\d{7,9}$/.test(dni) ||
      clave.length < 6
    ) {
      return err(
        res,
        'DNI de 7 a 9 dígitos y contraseña de al menos 6 caracteres'
      );
    }

    const existente = await Cliente.findOne({
      dni,
      _id: { $ne: id }
    });

    if (existente) {
      return err(res, 'Ese DNI ya está registrado');
    }

    await Cliente.findByIdAndUpdate(
      id,
      {
        $set: {
          dni,
          passwordHash: await bcrypt.hash(clave, 12),
          accesoApp: true,
          cambiarClave: true
        }
      },
      { runValidators: true }
    );

    res.redirect('/gestion');

  } catch (e) {
    next(e);
  }
});

router.post('/gestion/profesor', admin, async (req, res, next) => {
  try {
    const nombre = str(req.body.nombre);
    const usuario = str(req.body.usuario).toLowerCase();
    const clave = str(req.body.clave);

    if (
      !nombre ||
      !/^[-a-z0-9_.]{4,40}$/.test(usuario) ||
      clave.length < 10
    ) {
      return err(
        res,
        'Completá nombre, usuario válido y clave de al menos 10 caracteres'
      );
    }

    await Profesor.create({
      nombre,
      usuario,
      passwordHash: await bcrypt.hash(clave, 12)
    });

    res.redirect('/gestion');

  } catch (e) {
    if (e.code === 11000) {
      return err(res, 'El usuario ya existe');
    }
    next(e);
  }
});

router.post(
  '/gestion/profesor/:id/desactivar',
  admin,
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return err(res, 'ID inválido');
      }

      await Profesor.findByIdAndUpdate(
        req.params.id,
        { $set: { activo: false } }
      );

      res.redirect('/gestion');

    } catch (e) {
      next(e);
    }
  }
);

router.post('/gestion/novedad', admin, async (req, res, next) => {
  try {
    const titulo = str(req.body.titulo);
    const mensaje = str(req.body.mensaje);

    if (
      !titulo ||
      !mensaje ||
      titulo.length > 140 ||
      mensaje.length > 3000
    ) {
      return err(res, 'Título o mensaje inválido');
    }

    await Novedad.create({
      titulo,
      mensaje,
      tipo: str(req.body.tipo) || 'info'
    });

    res.redirect('/gestion');

  } catch (e) {
    next(e);
  }
});

router.post(
  '/gestion/novedad/:id/eliminar',
  admin,
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return err(res, 'ID inválido');
      }

      await Novedad.findByIdAndUpdate(
        req.params.id,
        { activa: false }
      );

      res.redirect('/gestion');

    } catch (e) {
      next(e);
    }
  }
);

router.post('/gestion/config', admin, async (req, res, next) => {
  try {
    const dias = Number(req.body.duracionCuota);

    if (
      !Number.isInteger(dias) ||
      dias < 1 ||
      dias > 365
    ) {
      return err(res, 'Duración de cuota inválida');
    }

    await Config.findByIdAndUpdate(
      'principal',
      {
        $set: {
          nombre: str(req.body.nombre),
          direccion: str(req.body.direccion),
          telefono: str(req.body.telefono),
          horarios: str(req.body.horarios),
          diasCerrados: str(req.body.diasCerrados),
          duracionCuota: dias
        }
      },
      {
        upsert: true,
        runValidators: true
      }
    );

    res.redirect('/gestion');

  } catch (e) {
    next(e);
  }
});

// ========================================
// RUTINAS - GUARDADO CORREGIDO
// ========================================

router.post('/rutinas/guardar', staff, async (req, res, next) => {
  try {
    const id = str(req.body.alumnoId);
    const dia = str(req.body.dia);
    const titulo = str(req.body.titulo);
    const rutinaId = str(req.body.rutinaId);

    const dias = [
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo'
    ];

    if (
      !validId(id) ||
      !dias.includes(dia) ||
      !titulo ||
      titulo.length > 180
    ) {
      return err(res, 'Alumno, día o título inválido');
    }

    if (rutinaId && !validId(rutinaId)) {
      return err(res, 'Identificador de rutina inválido');
    }

    if (!await Cliente.exists({ _id: id })) {
      return err(res, 'Alumno inexistente');
    }

    // Evita que un formulario antiguo borre grupos y calentamientos.
    if (!req.body.ejerciciosJson) {
      return err(
        res,
        'El editor no envió los ejercicios. Actualizá la página con Ctrl+Shift+R y volvé a intentar.'
      );
    }

    let datos;
    let cal;

    try {
      datos = JSON.parse(req.body.ejerciciosJson);
      cal = JSON.parse(req.body.calentaJson || '[]');

    } catch (e) {
      return err(res, 'No se pudo interpretar la rutina');
    }

    if (
      !Array.isArray(datos) ||
      !Array.isArray(cal) ||
      !datos.length ||
      datos.length > 50 ||
      cal.length > 20
    ) {
      return err(
        res,
        'Cantidad de ejercicios o calentamientos inválida'
      );
    }

    const ejercicios = datos.map(e => ({
      ...(validId(e._id) ? { _id: e._id } : {}),

      nombre: str(e.nombre).slice(0, 180),

      series: Math.min(
        100,
        Math.max(0, Number(e.series) || 0)
      ),

      repeticiones: str(e.repeticiones).slice(0, 50),
      descanso: str(e.descanso).slice(0, 50),
      peso: str(e.peso).slice(0, 50),
      indicaciones: str(e.indicaciones).slice(0, 200),

      grupo: /^[A-H]$/.test(str(e.grupo))
        ? str(e.grupo)
        : ''
    }));

    const calentamiento = cal.map(c => ({
      nombre: str(c.nombre).slice(0, 180),
      duracion: str(c.duracion).slice(0, 50),
      indicaciones: str(c.indicaciones).slice(0, 200)
    }));

    if (
      ejercicios.some(e => !e.nombre) ||
      calentamiento.some(c => !c.nombre)
    ) {
      return err(
        res,
        'Completá los nombres de los ejercicios y calentamientos'
      );
    }

    if (
      datos.some(e =>
        !Number.isFinite(Number(e.series)) ||
        Number(e.series) < 0 ||
        Number(e.series) > 100
      )
    ) {
      return err(res, 'Series inválidas');
    }

    // Validar bloques combinados.
    const grupos = {};

    ejercicios.forEach((e, i) => {
      if (e.grupo) {
        (grupos[e.grupo] ??= []).push(i);
      }
    });

    const bloquesInvalidos = Object.values(grupos).some(indices =>
      indices.length < 2 ||
      indices.length > 3 ||
      indices.some(
        (n, i) => i > 0 && n !== indices[i - 1] + 1
      )
    );

    if (bloquesInvalidos) {
      return err(
        res,
        'Cada bloque debe tener 2 o 3 ejercicios consecutivos'
      );
    }

    const cambios = {
      titulo,
      ejercicios,
      calentamiento,
      profesor: req.session.actor,
      actualizada: new Date()
    };

    let guardada;

    if (rutinaId) {
      // Editar exactamente la rutina seleccionada.
      // ========================================
// EDITAR RUTINA EXISTENTE
// ========================================

// Buscar por ID y alumno, sin exigir que coincida
// el día anterior.
const rutinaOriginal = await Rutina.findOne({
  _id: rutinaId,
  alumno: id
});

if (!rutinaOriginal) {
  return err(
    res,
    'No encontramos esta rutina para el alumno seleccionado. Recargá el panel y elegí Editar nuevamente.'
  );
}

// Evitar duplicar una rutina en el mismo día.
const otraRutina = await Rutina.findOne({
  alumno: id,
  dia,
  _id: { $ne: rutinaId }
});

if (otraRutina) {
  return err(
    res,
    'Este alumno ya tiene otra rutina para ' +
    dia +
    '. Seleccioná otro día o editá la rutina existente.'
  );
}

// Actualizar la rutina original.
guardada = await Rutina.findOneAndUpdate(
  {
    _id: rutinaId,
    alumno: id
  },
  {
    $set: {
      ...cambios,
      dia
    }
  },
  {
    new: true,
    runValidators: true
  }
);

if (!guardada) {
  return err(
    res,
    'No se pudo actualizar la rutina. Intentá nuevamente.'
  );
}

    } else {
      // Si ya existe una rutina para ese alumno y día,
      // actualizar la versión más reciente.
      const existente = await Rutina.findOne({
        alumno: id,
        dia
      })
        .sort({ actualizada: -1, _id: -1 })
        .select('_id')
        .lean();

      if (existente) {
        guardada = await Rutina.findByIdAndUpdate(
          existente._id,
          {
            $set: cambios
          },
          {
            new: true,
            runValidators: true
          }
        );

      } else {
        guardada = await Rutina.create({
          alumno: id,
          dia,
          ...cambios
        });
      }
    }

    // Verificar leyendo nuevamente desde MongoDB.
    const verificada = await Rutina.findById(
      guardada._id
    ).lean();

    const errorVerificacion =
      !verificada ||
      verificada.ejercicios.length !== ejercicios.length ||
      verificada.ejercicios.some((e, i) =>
        str(e.grupo) !== ejercicios[i].grupo ||
        str(e.peso) !== ejercicios[i].peso
      ) ||
      (verificada.calentamiento || []).length !==
        calentamiento.length;

    if (errorVerificacion) {
      console.error(
        'JP: La rutina no coincide después del guardado',
        String(guardada._id)
      );

      return res.status(500).send(
        'La rutina no se pudo verificar en MongoDB. No se confirmó el guardado. Revisá la terminal del servidor.'
      );
    }

    console.log(
      'JP rutina guardada y verificada:',
      String(guardada._id),
      dia,
      'grupos:',
      ejercicios
        .map(e => e.grupo)
        .filter(Boolean)
        .join(',')
    );

    res.redirect(
      '/profesor?rutina=guardada&id=' +
      encodeURIComponent(String(guardada._id))
    );

  } catch (e) {
    next(e);
  }
});

// ========================================
// ELIMINAR RUTINA
// ========================================

router.post(
  '/rutinas/:id/eliminar',
  staff,
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return err(res, 'ID inválido');
      }

      await Rutina.findByIdAndDelete(req.params.id);

      res.redirect('/profesor');

    } catch (e) {
      next(e);
    }
  }
);

// ========================================
// EXPORTAR RUTINAS
// ========================================

router.get(
  '/rutinas/exportar/:alumnoId',
  staff,
  async (req, res, next) => {
    try {
      if (!validId(req.params.alumnoId)) {
        return err(res, 'Alumno inválido');
      }

      const r = await Rutina.find({
        alumno: req.params.alumnoId
      }).lean();

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Rutinas');

      ws.addRow([
        'Día',
        'Título',
        'Ejercicio',
        'Series',
        'Repeticiones',
        'Descanso',
        'Peso',
        'Indicaciones'
      ]);

      r.forEach(x => {
        x.ejercicios.forEach(e => {
          ws.addRow([
            x.dia,
            x.titulo,
            e.nombre,
            e.series,
            e.repeticiones,
            e.descanso,
            e.peso,
            e.indicaciones
          ]);
        });
      });

      ws.columns.forEach(c => {
        c.width = 23;
      });

      res.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.set(
        'Content-Disposition',
        'attachment; filename="rutina.xlsx"'
      );

      await wb.xlsx.write(res);
      res.end();

    } catch (e) {
      next(e);
    }
  }
);

// ========================================
// JP ENTRENAMIENTO - IMPORTACIÓN EXCEL
// DETECCIÓN DE FORMATOS + BLOQUES + VISTA PREVIA
// ========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /\.xlsx$/i.test(file.originalname));
  }
});

const JP_DIAS = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves',
  'Viernes', 'Sábado', 'Domingo'
];

function jpNormal(x) {
  return String(x ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function jpEsc(x) {
  return String(x ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function jpCelda(c) {
  const x = c?.value;

  if (x == null) return '';

  if (typeof x === 'object') {
    if (Array.isArray(x.richText)) {
      return x.richText.map(t => t.text || '').join('').trim();
    }

    if (x.result != null) return String(x.result).trim();
    if (x.text != null) return String(x.text).trim();

    return '';
  }

  return String(x).trim();
}

function jpDia(x) {
  const t = jpNormal(x);
  const m = t.match(/^dia\s*([1-7])\b/);

  if (m) return JP_DIAS[Number(m[1]) - 1];

  return JP_DIAS.find(d => jpNormal(d) === t) || '';
}

function jpSerie(x) {
  const m = String(x).match(/\d+/);
  return m ? Math.min(100, Number(m[0])) : 0;
}

// ========================================
// LECTURA DE CADA HOJA EXCEL
// ========================================

function jpImportarHoja(ws) {
  const dias = new Map();
  const calentamientos = [];
  const avisos = [];

  let dia = '';
  let seccion = '';
  let formato = '';
  let pendientes = [];
  let grupoNum = 0;

  const fila = (row, n) => jpCelda(row.getCell(n));

  function vaciarGrupo() {
    if (!dia || !pendientes.length) {
      pendientes = [];
      return;
    }

    const destino = dias.get(dia);

    if (!destino) {
      pendientes = [];
      return;
    }

    if (pendientes.length === 2 || pendientes.length === 3) {
      const letra = 'ABCDEFGH'[grupoNum++];

      if (letra) {
        pendientes.forEach(e => {
          e.grupo = letra;
        });
      } else {
        avisos.push(
          `${dia}: hay más de 8 bloques. Revisar agrupación.`
        );
      }
    } else if (pendientes.length > 3) {
      avisos.push(
        `${dia}: un grupo de ${pendientes.length} ejercicios quedó individual para evitar combinaciones incorrectas.`
      );
    }

    destino.ejercicios.push(...pendientes);
    pendientes = [];
  }

  ws.eachRow({ includeEmpty: true }, row => {
    const a = fila(row, 1);
    const n = jpNormal(a);

    const resto = [2, 3, 4, 5, 6, 7, 8, 9]
      .map(i => fila(row, i));

    const vacia = !a && resto.every(x => !x);

    if (vacia) {
      if (seccion === 'rutina') vaciarGrupo();
      return;
    }

    // DETECTAR CALENTAMIENTOS
    if (/^(precalentamiento|entrada en calor)\b/.test(n)) {
      vaciarGrupo();
      seccion = 'calentamiento';
      dia = '';
      return;
    }

    if (/^(musculatura|ejercicios|ejercicio)$/.test(n)) {
      if (n === 'musculatura') {
        vaciarGrupo();
        seccion = 'rutina';
        dia = '';
      }
      return;
    }

    if (/^dia de tren (superior|inferior)/.test(n)) {
      if (seccion === 'calentamiento') {
        calentamientos.push({
          nombre: a,
          duracion: '',
          indicaciones: 'Encabezado de calentamiento'
        });
      }
      return;
    }

    // DETECTAR DÍA
    const nuevoDia = jpDia(a);

    if (nuevoDia && !fila(row, 3)) {
      vaciarGrupo();

      dia = nuevoDia;
      seccion = 'rutina';
      grupoNum = 0;

      if (!dias.has(dia)) {
        dias.set(dia, {
          titulo: 'Entrenamiento ' + dia,
          ejercicios: []
        });
      }

      return;
    }

    // COMPATIBILIDAD CON PLANTILLA ANTERIOR
    const esPlantilla = !!nuevoDia && !!fila(row, 3);

    if (esPlantilla) {
      vaciarGrupo();

      dia = nuevoDia;
      seccion = 'rutina';
      grupoNum = 0;

      if (!dias.has(dia)) {
        dias.set(dia, {
          titulo: fila(row, 2) || 'Entrenamiento ' + dia,
          ejercicios: []
        });
      }
    }

    const cols = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map(i => fila(row, i));

    const cabecera = cols.map(jpNormal).join(' ');

    // FORMATO COMPACTO
    if (
      /(^|\s)series(\s|$)/.test(cabecera) &&
      /(reps|repeticion|carga)/.test(cabecera)
    ) {
      formato = 'compacto';
      return;
    }

    // FORMATO AMPLIO
    if (/sets\/repeticion|tiempo descanso/.test(cabecera)) {
      formato = 'amplio';
      return;
    }

    if (
      /^(plan de entrenamiento|jp|semana|metas|actividad|para|inicio|nombre:|profe:|objetivo:|tabata\s*\d*\s*$)/.test(n) &&
      seccion !== 'rutina'
    ) {
      return;
    }

    // GUARDAR CALENTAMIENTOS
    if (seccion === 'calentamiento') {
      if (
        !a ||
        /^(actividad|tiempo|sets|intensidad|notas)$/.test(n)
      ) {
        return;
      }

      const sets = fila(row, 6) || fila(row, 2);
      const duracion = fila(row, 4) || fila(row, 3) || '';

      calentamientos.push({
        nombre: a.slice(0, 180),
        duracion: String(duracion || sets).slice(0, 50),
        indicaciones: [
          sets,
          fila(row, 8),
          fila(row, 9)
        ].filter(Boolean).join(' · ').slice(0, 200)
      });

      return;
    }

    if (seccion !== 'rutina' || !dia) return;

    // DETECTAR DISTRIBUCIÓN DE COLUMNAS
    const compacto =
      formato === 'compacto' ||
      (
        formato !== 'amplio' &&
        !!fila(row, 2) &&
        !!fila(row, 3) &&
        !fila(row, 7)
      );

    const nombre = esPlantilla ? fila(row, 3) : a;

    if (
      !nombre ||
      /^(ejercicios?|actividad|circuitos?|series|reps|carga|peso|descanso)$/i.test(jpNormal(nombre))
    ) {
      return;
    }

    const serie = esPlantilla
      ? fila(row, 4)
      : (compacto ? fila(row, 2) : fila(row, 4));

    const reps = esPlantilla
      ? fila(row, 5)
      : (compacto ? fila(row, 3) : fila(row, 5));

    const peso = esPlantilla
      ? fila(row, 7)
      : (
          compacto
            ? fila(row, 4)
            : (fila(row, 7) || fila(row, 6))
        );

    const descanso = esPlantilla
      ? fila(row, 6)
      : (compacto ? '' : fila(row, 8));

    const indicaciones = esPlantilla
      ? fila(row, 8)
      : (compacto ? fila(row, 5) : fila(row, 9));

    if (!serie && !reps && !peso) return;

    pendientes.push({
      nombre: nombre.slice(0, 180),
      series: jpSerie(serie),
      repeticiones: reps.slice(0, 50),
      peso: peso.slice(0, 50),
      descanso: descanso.slice(0, 50),
      indicaciones: indicaciones.slice(0, 200),
      grupo: ''
    });
  });

  vaciarGrupo();

  return {
    dias,
    calentamientos,
    avisos
  };
}

// ========================================
// SUBIR EXCEL Y GENERAR VISTA PREVIA
// ========================================

router.post(
  '/rutinas/importar',
  staff,
  upload.single('archivo'),
  async (req, res, next) => {
    try {
      const alumnoId = str(req.body.alumnoId);

      if (!validId(alumnoId) || !req.file) {
        return err(
          res,
          'Seleccioná un alumno y un archivo Excel .xlsx de hasta 2 MB'
        );
      }

      if (!await Cliente.exists({ _id: alumnoId })) {
        return err(res, 'Alumno inexistente');
      }

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);

      const dias = new Map();
      const calentamientos = [];
      const avisos = [];

      for (const ws of wb.worksheets) {
        const resultado = jpImportarHoja(ws);

        for (const [dia, r] of resultado.dias) {
          if (!dias.has(dia)) {
            dias.set(dia, r);
          } else {
            dias.get(dia).ejercicios.push(...r.ejercicios);
          }
        }

        calentamientos.push(...resultado.calentamientos);
        avisos.push(...resultado.avisos);
      }

      if (!dias.size) {
        return err(
          res,
          'No se detectaron rutinas DÍA 1, DÍA 2, etc. No se modificó nada.'
        );
      }

      for (const [dia, r] of dias) {
        if (!r.ejercicios.length) {
          dias.delete(dia);
        } else if (r.ejercicios.length > 50) {
          return err(
            res,
            `${dia} tiene más de 50 ejercicios. No se modificó nada.`
          );
        }
      }

      if (!dias.size) {
        return err(
          res,
          'No se detectaron ejercicios válidos. No se modificó nada.'
        );
      }

      if (calentamientos.length > 20) {
        avisos.push(
          'Se importarán solamente los primeros 20 calentamientos.'
        );
      }

      avisos.push(
        'Los calentamientos generales del Excel se asignarán a cada día importado. Revisá si corresponden a tren superior o inferior.'
      );

      // GUARDAR TEMPORALMENTE PARA REVISIÓN
      req.session.jpImportacion = {
        alumnoId,
        creado: Date.now(),
        avisos,
        dias: [...dias].map(([dia, r]) => ({
          dia,
          titulo: r.titulo,
          ejercicios: r.ejercicios,
          calentamiento: calentamientos.slice(0, 20)
        }))
      };

      req.session.save(e => {
        if (e) return next(e);

        res.redirect('/rutinas/importar/vista-previa');
      });

    } catch (e) {
      next(e);
    }
  }
);

// ========================================
// VISTA PREVIA DE LA IMPORTACIÓN
// ========================================

router.get(
  '/rutinas/importar/vista-previa',
  staff,
  (req, res) => {
    const p = req.session.jpImportacion;

    if (!p || Date.now() - p.creado > 30 * 60 * 1000) {
      return res.redirect('/profesor');
    }

    const contenido = p.dias.map(r => `
      <section style="
        background:white;
        border:1px solid #d9e4f4;
        border-radius:14px;
        padding:20px;
        margin:16px 0;
        overflow-x:auto;
      ">
        <h2>
          ${jpEsc(r.dia)} —
          ${jpEsc(r.ejercicios.length)} ejercicios
        </h2>

        <table style="
          width:100%;
          border-collapse:collapse;
          text-align:left;
        ">
          <thead>
            <tr>
              <th>Bloque</th>
              <th>Ejercicio</th>
              <th>Series</th>
              <th>Reps</th>
              <th>Peso</th>
              <th>Descanso</th>
            </tr>
          </thead>

          <tbody>
            ${r.ejercicios.map(e => `
              <tr>
                ${[
                  e.grupo,
                  e.nombre,
                  e.series,
                  e.repeticiones,
                  e.peso,
                  e.descanso
                ].map(x => `
                  <td style="
                    border-bottom:1px solid #eee;
                    padding:8px;
                  ">
                    ${jpEsc(x)}
                  </td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>

        <p>
          <b>Calentamientos:</b>
          ${
            r.calentamiento.map(x =>
              jpEsc(x.nombre)
            ).join(' · ') || 'Sin calentamientos'
          }
        </p>
      </section>
    `).join('');

    res.set('Cache-Control', 'no-store');

    res.type('html').send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >
        <title>Vista previa · JP Entrenamiento</title>
      </head>

      <body style="
        font-family:Arial,sans-serif;
        background:#f1f5fc;
        color:#17365e;
        max-width:1050px;
        margin:30px auto;
        padding:16px;
      ">

        <h1>JP Entrenamiento · Vista previa</h1>

        <p>
          Revisá los ejercicios antes de reemplazar
          las rutinas de los días indicados.
          Los demás días no se modificarán.
        </p>

        ${p.avisos.map(a => `
          <p style="
            background:#fff5d9;
            padding:12px;
            border-radius:8px;
          ">
            ⚠️ ${jpEsc(a)}
          </p>
        `).join('')}

        ${contenido}

        <form
          method="post"
          action="/rutinas/importar/confirmar"
        >
          <button style="
            background:#244b91;
            color:white;
            padding:15px;
            border:0;
            border-radius:10px;
            cursor:pointer;
            font-weight:bold;
          ">
            ✓ Confirmar y guardar
          </button>

          <a
            href="/profesor"
            style="margin-left:20px"
          >
            Cancelar sin guardar
          </a>
        </form>

      </body>
      </html>
    `);
  }
);

// ========================================
// CONFIRMAR Y GUARDAR RUTINAS
// ========================================

router.post(
  '/rutinas/importar/confirmar',
  staff,
  async (req, res, next) => {
    try {
      const p = req.session.jpImportacion;

      if (!p || Date.now() - p.creado > 30 * 60 * 1000) {
        return err(
          res,
          'La vista previa venció. Importá el archivo nuevamente.'
        );
      }

      if (!await Cliente.exists({ _id: p.alumnoId })) {
        return err(res, 'Alumno inexistente');
      }

      let cantidad = 0;

      for (const r of p.dias) {
        await Rutina.findOneAndUpdate(
          {
            alumno: p.alumnoId,
            dia: r.dia
          },
          {
            $set: {
              titulo: r.titulo,
              ejercicios: r.ejercicios,
              calentamiento: r.calentamiento,
              profesor: req.session.actor,
              actualizada: new Date()
            }
          },
          {
            upsert: true,
            runValidators: true,
            new: true
          }
        );

        cantidad += r.ejercicios.length;
      }

      delete req.session.jpImportacion;

      req.session.save(e => {
        if (e) return next(e);

        res.redirect('/profesor?importado=' + cantidad);
      });

    } catch (e) {
      next(e);
    }
  }
);

// ========================================
// FIN IMPORTACIÓN EXCEL
// ========================================

// ========================================
// CUENTAS CORRIENTES
// ========================================

router.get('/cuentas', staff, async (req, res, next) => {
  try {
    const [
      clientes,
      productos,
      movs,
      saldos
    ] = await Promise.all([

      Cliente.find()
        .select('nombre apellido')
        .sort({ apellido: 1, nombre: 1 })
        .lean(),

      Producto.find({ activo: true })
        .sort({ nombre: 1 })
        .lean(),

      Mov.find()
        .populate('alumno', 'nombre apellido')
        .sort({ fecha: -1 })
        .limit(30)
        .lean(),

      Mov.aggregate([
        {
          $group: {
            _id: '$alumno',

            total: {
              $sum: {
                $cond: [
                  { $eq: ['$tipo', 'cargo'] },
                  '$importe',
                  { $multiply: ['$importe', -1] }
                ]
              }
            }
          }
        }
      ])
    ]);

    const mapaSaldos = new Map();

    saldos.forEach(s => {
      mapaSaldos.set(
        String(s._id),
        Math.round(Number(s.total || 0) * 100) / 100
      );
    });

    const clientesConSaldo = clientes.map(c => ({
      ...c,
      saldoCuenta:
        mapaSaldos.get(String(c._id)) || 0
    }));

    const deudores = clientesConSaldo
      .filter(c => c.saldoCuenta > 0.009)
      .sort(
        (a, b) => b.saldoCuenta - a.saldoCuenta
      );

    const totalPendiente = Math.round(
      deudores.reduce(
        (total, c) => total + c.saldoCuenta,
        0
      ) * 100
    ) / 100;

    render(res, 'accounts', {
      clientes: clientesConSaldo,
      productos,
      movs,
      deudores,
      totalPendiente
    });

  } catch (error) {
    next(error);
  }
});

router.get('/cuentas/:id', staff, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return err(res, 'Alumno inválido');
    }

    const c = await Cliente.findById(req.params.id);

    if (!c) {
      return err(res, 'Alumno no encontrado');
    }

    const cuenta = await saldo(c._id);

    render(res, 'account-detail', {
      c,
      cuenta
    });

  } catch (e) {
    next(e);
  }
});

// ========================================
// VENTAS
// ========================================

router.post('/cuentas/venta', staff, async (req, res, next) => {
  try {
    const alumnoId = str(req.body.alumnoId);
    const productoId = str(req.body.productoId);
    const cantidad = Number(req.body.cantidad);
    const modalidad = str(req.body.modalidad);
    const medio = str(req.body.medio);

    if (
      !validId(alumnoId) ||
      !validId(productoId) ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > 100 ||
      !['ahora', 'cuenta'].includes(modalidad)
    ) {
      return err(res, 'Datos de venta inválidos');
    }

    if (!await Cliente.exists({ _id: alumnoId })) {
      return err(res, 'Alumno inexistente');
    }

    if (
      modalidad === 'ahora' &&
      ![
        'Efectivo',
        'Transferencia',
        'Mercado Pago',
        'Otro'
      ].includes(medio)
    ) {
      return err(res, 'Medio de pago inválido');
    }

    const prod = await Producto.findOneAndUpdate(
      {
        _id: productoId,
        activo: true,
        stock: { $gte: cantidad }
      },
      {
        $inc: { stock: -cantidad }
      },
      {
        new: false
      }
    );

    if (!prod) {
      return err(res, 'Stock insuficiente');
    }

    const total = Math.round(
      prod.precioVenta * cantidad * 100
    ) / 100;

    if (total < 0) {
      await Producto.updateOne(
        { _id: productoId },
        { $inc: { stock: cantidad } }
      );

      return err(res, 'Precio inválido');
    }

    let venta;

    try {
      venta = await Venta.create({
        producto: prod._id,
        nombreProducto: prod.nombre,
        cantidad,
        precioUnitario: prod.precioVenta,
        total,
        metodoPago:
          modalidad === 'cuenta' ? 'Otro' : medio,
        alumno: alumnoId,
        aCuenta: modalidad === 'cuenta',
        actor: req.session.actor,
        observacion:
          modalidad === 'cuenta'
            ? 'Cuenta corriente'
            : 'Pago inmediato'
      });

      if (modalidad === 'cuenta') {
        await Mov.create({
          alumno: alumnoId,
          tipo: 'cargo',
          importe: total,
          descripcion: prod.nombre + ' x' + cantidad,
          producto: prod._id,
          cantidad,
          venta: venta._id,
          actor: req.session.actor,
          operacion: crypto.randomUUID()
        });
      }

    } catch (e) {
      if (venta) {
        await Venta.deleteOne({ _id: venta._id });
      }

      await Producto.updateOne(
        { _id: productoId },
        { $inc: { stock: cantidad } }
      );

      throw e;
    }

    res.redirect('/cuentas/' + alumnoId);

  } catch (e) {
    next(e);
  }
});

router.post('/cuentas/pago', staff, async (req, res, next) => {
  try {
    const id = str(req.body.alumnoId);
    const importe = Number(req.body.importe);
    const medio = str(req.body.medio);

    if (
      !validId(id) ||
      !Number.isFinite(importe) ||
      importe <= 0 ||
      ![
        'Efectivo',
        'Transferencia',
        'Mercado Pago',
        'Otro'
      ].includes(medio)
    ) {
      return err(res, 'Pago inválido');
    }

    const cuenta = await saldo(id);

    if (importe > cuenta.total + 0.001) {
      return err(
        res,
        'El pago supera el saldo pendiente'
      );
    }

    await Mov.create({
      alumno: id,
      tipo: 'pago',
      importe: Math.round(importe * 100) / 100,
      descripcion: 'Pago de cuenta corriente',
      medio,
      actor: req.session.actor,
      operacion: crypto.randomUUID()
    });

    res.redirect('/cuentas/' + id);

  } catch (e) {
    next(e);
  }
});

// ========================================
// MENSAJES DEL PROFESOR
// ========================================

router.post('/profesor/mensaje', staff, async (req, res, next) => {
  try {
    const titulo = str(req.body.titulo);
    const mensaje = str(req.body.mensaje);
    const destinatario = str(req.body.destinatario);
    const alumnoId = str(req.body.alumnoId);

    if (
      !titulo ||
      !mensaje ||
      titulo.length > 100 ||
      mensaje.length > 1000
    ) {
      return err(
        res,
        'Completá el título y el mensaje.'
      );
    }

    if (
      !['individual', 'grupal'].includes(destinatario)
    ) {
      return err(
        res,
        'Seleccioná un destinatario válido.'
      );
    }

    let alumno = null;

    if (destinatario === 'individual') {
      if (!validId(alumnoId)) {
        return err(
          res,
          'Seleccioná un alumno válido.'
        );
      }

      const existe = await Cliente.exists({
        _id: alumnoId,
        accesoApp: true
      });

      if (!existe) {
        return err(
          res,
          'El alumno no tiene acceso a la aplicación.'
        );
      }

      alumno = alumnoId;
    }

    await MensajeProfesor.create({
      titulo,
      mensaje,
      destinatario,
      alumno,
      profesor: req.session.actor || 'Profesor'
    });

    res.redirect('/profesor?mensaje=enviado');

  } catch (error) {
    next(error);
  }
});

// ========================================
// MENSAJES DEL ALUMNO
// ========================================

router.get('/mi-app/mensajes', alumno, async (req, res, next) => {
  try {
    const alumnoId = req.session.uid;

    const mensajes = await MensajeProfesor.find({
      activo: true,

      $or: [
        {
          destinatario: 'grupal'
        },
        {
          destinatario: 'individual',
          alumno: alumnoId
        }
      ]
    })
      .sort({ fecha: -1 })
      .limit(30)
      .lean();

    const resultado = mensajes.map(m => ({
      id: String(m._id),
      titulo: m.titulo,
      mensaje: m.mensaje,
      profesor: m.profesor,
      fecha: m.fecha,

      leido: (m.leidoPor || []).some(
        id => String(id) === String(alumnoId)
      )
    }));

    res.json({
      ok: true,
      mensajes: resultado
    });

  } catch (error) {
    next(error);
  }
});

router.post(
  '/mi-app/mensajes/:id/leido',
  alumno,
  async (req, res, next) => {
    try {
      const id = str(req.params.id);
      const alumnoId = req.session.uid;

      if (!validId(id)) {
        return res.status(400).json({
          ok: false,
          error: 'Mensaje inválido'
        });
      }

      const resultado = await MensajeProfesor.updateOne(
        {
          _id: id,
          activo: true,

          $or: [
            { destinatario: 'grupal' },
            {
              destinatario: 'individual',
              alumno: alumnoId
            }
          ]
        },
        {
          $addToSet: {
            leidoPor: alumnoId
          }
        }
      );

      if (!resultado.matchedCount) {
        return res.status(404).json({
          ok: false,
          error: 'Mensaje no encontrado'
        });
      }

      res.json({ ok: true });

    } catch (error) {
      next(error);
    }
  }
);

// ========================================
// SEGUIMIENTO DE ENTRENAMIENTOS
// ========================================

function fechaArgentina() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

// ========================================
// CONSULTAR PROGRESO DEL ALUMNO
// ========================================

router.get('/mi-app/progreso', alumno, async (req, res, next) => {
  try {
    const fecha = fechaArgentina();

    const registros = await ProgresoEntrenamiento.find({
      alumno: req.session.uid,
      fecha
    }).lean();

    res.json({
      ok: true,
      fecha,

      registros: registros.map(r => ({
        rutina: String(r.rutina),
        ejercicios: r.ejercicios
      }))
    });

  } catch (error) {
    next(error);
  }
});

// ========================================
// GUARDAR EJERCICIO COMPLETADO
// ========================================

router.post('/mi-app/progreso', alumno, async (req, res, next) => {
  try {
    const rutinaId = str(req.body.rutinaId);
    const ejercicioIndex = Number(req.body.ejercicioIndex);
    const completado = req.body.completado === true;

    if (
      !validId(rutinaId) ||
      !Number.isInteger(ejercicioIndex) ||
      ejercicioIndex < 0
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Datos inválidos'
      });
    }

    const rutina = await Rutina.findOne({
      _id: rutinaId,
      alumno: req.session.uid
    }).lean();

    if (
      !rutina ||
      ejercicioIndex >= rutina.ejercicios.length
    ) {
      return res.status(404).json({
        ok: false,
        error: 'Ejercicio no encontrado'
      });
    }

    const fecha = fechaArgentina();

    let registro = await ProgresoEntrenamiento.findOne({
      alumno: req.session.uid,
      rutina: rutinaId,
      fecha
    });

    if (!registro) {
      registro = new ProgresoEntrenamiento({
        alumno: req.session.uid,
        rutina: rutinaId,
        fecha,
        dia: rutina.dia,
        titulo: rutina.titulo,

        ejercicios: rutina.ejercicios.map(e => ({
          nombre: e.nombre,
          completado: false
        }))
      });
    }

    // Sincronizar si cambió la rutina.
    if (
      registro.ejercicios.length !==
        rutina.ejercicios.length ||
      registro.ejercicios.some(
        (e, i) =>
          e.nombre !== rutina.ejercicios[i].nombre
      )
    ) {
      const anteriores = registro.ejercicios.map(e => ({
        nombre: e.nombre,
        completado: e.completado
      }));

      registro.ejercicios = rutina.ejercicios.map(e => {
        const i = anteriores.findIndex(
          a => a.nombre === e.nombre
        );

        return {
          nombre: e.nombre,

          completado: i >= 0
            ? anteriores.splice(i, 1)[0].completado
            : false
        };
      });
    }

    registro.ejercicios[ejercicioIndex].completado =
      completado;

    registro.actualizado = new Date();

    await registro.save();

    res.json({
      ok: true,
      fecha
    });

  } catch (error) {
    next(error);
  }
});

// ========================================
// HISTORIAL PARA EL PROFESOR
// ========================================

router.get(
  '/profesor/progreso/:alumnoId',
  staff,
  async (req, res, next) => {
    try {
      const alumnoId = str(req.params.alumnoId);

      if (!validId(alumnoId)) {
        return res.status(400).json({
          ok: false,
          error: 'Alumno inválido'
        });
      }

      const cliente = await Cliente.findById(alumnoId)
        .select('nombre apellido')
        .lean();

      if (!cliente) {
        return res.status(404).json({
          ok: false,
          error: 'Alumno no encontrado'
        });
      }

      const registros = await ProgresoEntrenamiento.find({
        alumno: alumnoId
      })
        .sort({
          fecha: -1,
          actualizado: -1
        })
        .limit(60)
        .lean();

      res.json({
        ok: true,
        alumno: `${cliente.nombre} ${cliente.apellido}`,

        registros: registros.map(r => {
          const total = r.ejercicios.length;

          const completados = r.ejercicios.filter(
            e => e.completado
          ).length;

          return {
            fecha: r.fecha,
            dia: r.dia,
            titulo: r.titulo,
            total,
            completados,

            porcentaje: total
              ? Math.round(completados * 100 / total)
              : 0,

            ejercicios: r.ejercicios
          };
        })
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;