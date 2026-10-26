const express=require('express');const router=express.Router();const bcrypt=require('bcryptjs');const crypto=require('crypto');const ExcelJS=require('exceljs');const multer=require('multer');
const Cliente=require('../models/cliente'),Profesor=require('../models/Profesor'),Rutina=require('../models/Rutina'),Producto=require('../models/Producto'),Venta=require('../models/Venta'),Mov=require('../models/MovimientoCuenta'),Novedad=require('../models/Novedad'),Config=require('../models/ConfiguracionGym');
const admin=(req,res,next)=>req.session.rol==='dueno'?next():res.status(403).send('Acceso restringido');
const staff=(req,res,next)=>['dueno','profesor'].includes(req.session.rol)?next():res.redirect('/acceso');
const alumno=(req,res,next)=>req.session.rol==='alumno'?next():res.redirect('/acceso');
const str=x=>String(x??'').trim();const validId=x=>/^[a-f\d]{24}$/i.test(str(x));const money=x=>Number(x)||0;
const err=(res,msg)=>res.status(400).render('jp2/message',{titulo:'Revisá los datos',mensaje:msg,volver:'javascript:history.back()'});
const saldo=async id=>{const movs=await Mov.find({alumno:id}).sort({fecha:-1}).lean();return {movs,total:Math.round(movs.reduce((a,m)=>a+(m.tipo==='cargo'?m.importe:-m.importe),0)*100)/100}};
const MensajeProfesor = require('../models/MensajeProfesor');
const ProgresoEntrenamiento = require('../models/ProgresoEntrenamiento');
async function config(){return await Config.findById('principal')||new Config({_id:'principal'})}
function fechaVenc(c,dias=31){const f=c.fechaPago||c.fechaInicio;if(!f)return null;const d=new Date(f);d.setUTCDate(d.getUTCDate()+dias);return d}
function render(res,name,data={}){res.render('jp2/'+name,data)}
router.get('/acceso',(req,res)=>render(res,'access',{error:req.query.error||''}));
router.post('/acceso',async(req,res,next)=>{try{const tipo=str(req.body.tipo),usuario=str(req.body.usuario),clave=str(req.body.clave);let obj;if(tipo==='alumno'){if(!/^\d{7,9}$/.test(usuario))return res.redirect('/acceso?error=1');obj=await Cliente.findOne({dni:usuario,accesoApp:true}).select('+passwordHash');}else if(tipo==='profesor'){obj=await Profesor.findOne({usuario:usuario.toLowerCase(),activo:true}).select('+passwordHash')}else return res.redirect('/acceso?error=1');if(!obj?.passwordHash||!await bcrypt.compare(clave,obj.passwordHash))return res.redirect('/acceso?error=1');req.session.regenerate(e=>{if(e)return next(e);req.session.rol=tipo;req.session.uid=String(obj._id);req.session.actor=tipo==='alumno'?obj.nombre+' '+obj.apellido:obj.nombre;req.session.save(()=>res.redirect(tipo==='alumno'?'/mi-app':'/profesor'))})}catch(e){next(e)}});
router.get('/mi-app',alumno,async(req,res,next)=>{try{const c=await Cliente.findById(req.session.uid);if(!c)return res.redirect('/logout');const [rutinas,novedades,conf,cuenta]=await Promise.all([Rutina.find({alumno:c._id}).lean(),Novedad.find({activa:true}).sort({fecha:-1}).limit(12).lean(),config(),saldo(c._id)]);render(res,'student',{c,rutinas,novedades,conf,cuenta,venc:fechaVenc(c,conf.duracionCuota)})}catch(e){next(e)}});
router.post('/mi-app/clave',alumno,async(req,res,next)=>{try{if(str(req.body.nueva).length<6)return err(res,'La contraseña debe tener al menos 6 caracteres');const c=await Cliente.findById(req.session.uid).select('+passwordHash');if(!await bcrypt.compare(str(req.body.actual),c.passwordHash))return err(res,'Contraseña actual incorrecta');c.passwordHash=await bcrypt.hash(str(req.body.nueva),12);c.cambiarClave=false;await c.save();res.redirect('/mi-app')}catch(e){next(e)}});
router.get('/profesor',staff,async(req,res,next)=>{try{const [clientes,productos,profesores,rutinas]=await Promise.all([Cliente.find().select('nombre apellido dni fechaPago plan').sort({apellido:1}).lean(),Producto.find({activo:true}).sort({nombre:1}).lean(),Profesor.find().select('-passwordHash').lean(),Rutina.find().populate('alumno','nombre apellido').sort({actualizada:-1}).limit(60).lean()]);render(res,'teacher',{clientes,productos,profesores,rutinas,importado: Math.max(0, Number(req.query.importado) || 0),
mensajeEnviado: req.query.mensaje === 'enviado'})}catch(e){next(e)}});
router.get('/gestion',admin,async(req,res,next)=>{try{const [clientes,profesores,novedades,conf,cuentas]=await Promise.all([Cliente.find().sort({apellido:1}).lean(),Profesor.find().lean(),Novedad.find().sort({fecha:-1}).lean(),config(),Mov.aggregate([{$group:{_id:'$alumno',total:{$sum:{$cond:[{$eq:['$tipo','cargo']},'$importe',{$multiply:['$importe',-1]}]}}}}])]);render(res,'manage',{clientes,profesores,novedades,conf,cuentas})}catch(e){next(e)}});
router.post('/gestion/acceso',admin,async(req,res,next)=>{try{const id=str(req.body.alumnoId),dni=str(req.body.dni).replace(/\D/g,''),clave=str(req.body.clave);if(!validId(id)||!/^\d{7,9}$/.test(dni)||clave.length<6)return err(res,'DNI de 7 a 9 dígitos y contraseña de 10 caracteres como mínimo');const existente=await Cliente.findOne({dni,_id:{$ne:id}});if(existente)return err(res,'Ese DNI ya está registrado');await Cliente.findByIdAndUpdate(id,{$set:{dni,passwordHash:await bcrypt.hash(clave,12),accesoApp:true,cambiarClave:true}},{runValidators:true});res.redirect('/gestion')}catch(e){next(e)}});
router.post('/gestion/profesor',admin,async(req,res,next)=>{try{const nombre=str(req.body.nombre),usuario=str(req.body.usuario).toLowerCase(),clave=str(req.body.clave);if(!nombre||!/^[-a-z0-9_.]{4,40}$/.test(usuario)||clave.length<10)return err(res,'Completá nombre, usuario válido y clave de al menos 10 caracteres');await Profesor.create({nombre,usuario,passwordHash:await bcrypt.hash(clave,12)});res.redirect('/gestion')}catch(e){if(e.code===11000)return err(res,'El usuario ya existe');next(e)}});
router.post('/gestion/profesor/:id/desactivar',admin,async(req,res,next)=>{try{if(!validId(req.params.id))return err(res,'ID inválido');await Profesor.findByIdAndUpdate(req.params.id,{$set:{activo:false}});res.redirect('/gestion')}catch(e){next(e)}});
router.post('/gestion/novedad',admin,async(req,res,next)=>{try{const titulo=str(req.body.titulo),mensaje=str(req.body.mensaje);if(!titulo||!mensaje||titulo.length>140||mensaje.length>3000)return err(res,'Título o mensaje inválido');await Novedad.create({titulo,mensaje,tipo:str(req.body.tipo)||'info'});res.redirect('/gestion')}catch(e){next(e)}});
router.post('/gestion/novedad/:id/eliminar',admin,async(req,res,next)=>{try{if(!validId(req.params.id))return err(res,'ID inválido');await Novedad.findByIdAndUpdate(req.params.id,{activa:false});res.redirect('/gestion')}catch(e){next(e)}});
router.post('/gestion/config',admin,async(req,res,next)=>{try{const dias=Number(req.body.duracionCuota);if(!Number.isInteger(dias)||dias<1||dias>365)return err(res,'Duración de cuota inválida');await Config.findByIdAndUpdate('principal',{$set:{nombre:str(req.body.nombre),direccion:str(req.body.direccion),telefono:str(req.body.telefono),horarios:str(req.body.horarios),diasCerrados:str(req.body.diasCerrados),duracionCuota:dias}},{upsert:true,runValidators:true});res.redirect('/gestion')}catch(e){next(e)}});
router.post('/rutinas/guardar',staff,async(req,res,next)=>{try{const id=str(req.body.alumnoId),dia=str(req.body.dia),titulo=str(req.body.titulo);if(!validId(id)||!['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].includes(dia)||!titulo)return err(res,'Alumno, día o título inválido');const ejercicios=str(req.body.ejercicios).split(/\r?\n/).map(line=>line.split('|').map(x=>x.trim())).filter(a=>a[0]).slice(0,50).map(a=>({nombre:a[0],series:Math.max(0,Number(a[1])||0),repeticiones:a[2]||'',descanso:a[3]||'',peso:a[4]||'',indicaciones:a[5]||''}));if(!ejercicios.length)return err(res,'Agregá al menos un ejercicio');await Rutina.findOneAndUpdate({alumno:id,dia},{$set:{titulo,ejercicios,profesor:req.session.actor,actualizada:new Date()}},{upsert:true,new:true,runValidators:true});res.redirect('/profesor')}catch(e){next(e)}});
router.post('/rutinas/:id/eliminar',staff,async(req,res,next)=>{try{if(!validId(req.params.id))return err(res,'ID inválido');await Rutina.findByIdAndDelete(req.params.id);res.redirect('/profesor')}catch(e){next(e)}});
router.get('/rutinas/exportar/:alumnoId',staff,async(req,res,next)=>{try{if(!validId(req.params.alumnoId))return err(res,'Alumno inválido');const r=await Rutina.find({alumno:req.params.alumnoId}).lean();const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Rutinas');ws.addRow(['Día','Título','Ejercicio','Series','Repeticiones','Descanso','Peso','Indicaciones']);r.forEach(x=>x.ejercicios.forEach(e=>ws.addRow([x.dia,x.titulo,e.nombre,e.series,e.repeticiones,e.descanso,e.peso,e.indicaciones])));ws.columns.forEach(c=>c.width=23);res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="rutina.xlsx"');await wb.xlsx.write(res);res.end()}catch(e){next(e)}});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,/\.xlsx$/i.test(file.originalname))});
// Admite la plantilla JP2 y la planilla habitual del gimnasio (DÍA 1...5).
function excelTexto(cell){
 const v=cell?.value;
 if(v===null||v===undefined)return '';
 if(typeof v==='object'){
   if(Array.isArray(v.richText))return v.richText.map(t=>t.text||'').join('').trim();
   if(v.result!==undefined)return str(v.result);
   if(v.text!==undefined)return str(v.text);
   if(v.hyperlink!==undefined)return str(v.text||'');
   return '';
 }
 return str(v);
}
function excelDia(texto){
 const t=str(texto).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const m=t.match(/\bdia\s*([1-7])\b/);
 if(m)return ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][Number(m[1])-1];
 return ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].find(d=>d.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===t)||'';
}
function importarFilas(ws){
 const grupos=new Map();let dia='',titulo='',formato='';
 ws.eachRow((row,i)=>{
   const v=n=>excelTexto(row.getCell(n));
   const primero=v(1), a=primero.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const nuevoDia=excelDia(primero);
   if(nuevoDia&&!v(3)){dia=nuevoDia;titulo=/^dia\s*\d/i.test(primero)?'Entrenamiento '+primero:primero;return}
   if(/^(ejercicios|actividad|musculatura|precalentamiento|plan de entrenamiento|metas|semana)$/i.test(a))return;
   if(/^(dia de tren|calentamiento)/i.test(a)){dia='';return}
   if(a==='dia'&&v(3).toLowerCase()==='ejercicio'){formato='plantilla';return}
   if(i===1&&a==='dia'){formato='plantilla';return}
   // Plantilla exportada: Día, Título, Ejercicio, Series, Repeticiones, Descanso, Peso, Indicaciones.
   const filaPlantilla=excelDia(primero)&&!!v(3);
   if(filaPlantilla){formato='plantilla';dia=excelDia(primero);titulo=v(2)||'Entrenamiento '+dia}
   if(!dia)return;
   const nombre=filaPlantilla?v(3):primero;
   if(!nombre||/^(ejercicios|actividad|circuitos?)$/i.test(nombre)&&!v(4))return;
   const seriesTexto=filaPlantilla?v(4):v(4);
   const serieMatch=seriesTexto.match(/\d+/);
   const e={nombre:nombre.slice(0,180),series:serieMatch?Number(serieMatch[0]):0,repeticiones:filaPlantilla?v(5):v(5),descanso:filaPlantilla?v(6):(v(8)||''),peso:filaPlantilla?v(7):(v(7)||v(6)),indicaciones:filaPlantilla?v(8):v(9)};
   // En la planilla del gimnasio las filas de ejercicios tienen series en D y repeticiones en E.
   if(!filaPlantilla&&!v(4)&&!v(5)&&!v(7))return;
   const g=grupos.get(dia)||{titulo,ejercicios:[]};g.ejercicios.push(e);grupos.set(dia,g);
 });
 return grupos;
}
router.post('/rutinas/importar',staff,upload.single('archivo'),async(req,res,next)=>{
 try{
   const id=str(req.body.alumnoId);
   if(!validId(id)||!req.file)return err(res,'Seleccioná un alumno y un archivo .xlsx menor de 2 MB');
   if(!await Cliente.exists({_id:id}))return err(res,'Alumno no encontrado');
   const wb=new ExcelJS.Workbook();await wb.xlsx.load(req.file.buffer);
   let grupos=new Map();
   for(const ws of wb.worksheets){const g=importarFilas(ws);for(const [dia,r] of g){const existente=grupos.get(dia);if(existente)existente.ejercicios.push(...r.ejercicios);else grupos.set(dia,r)}}
   if(!grupos.size)return err(res,'No encontramos días y ejercicios reconocibles en el Excel. Revisá que tenga DÍA 1, DÍA 2, etc., o usá la plantilla exportada.');
   for(const [dia,g] of grupos){await Rutina.findOneAndUpdate({alumno:id,dia},{$set:{titulo:g.titulo,ejercicios:g.ejercicios.slice(0,50),profesor:req.session.actor,actualizada:new Date()}},{upsert:true,runValidators:true})}
   res.redirect('/profesor?importado='+encodeURIComponent([...grupos.values()].reduce((n,g)=>n+g.ejercicios.length,0)));
 }catch(e){if(e.name==='Error'&&/zip|workbook|invalid|corrupt/i.test(e.message))return err(res,'El archivo Excel no se pudo leer. Guardalo nuevamente como .xlsx.');next(e)}
});
router.get('/cuentas', staff, async (req, res, next) => {
  try {

    const [clientes, productos, movs, saldos] = await Promise.all([

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

      // Calculamos el saldo usando TODOS los movimientos.
      // No solamente los últimos 30 o 150.
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
      saldoCuenta: mapaSaldos.get(String(c._id)) || 0
    }));

    const deudores = clientesConSaldo
      .filter(c => c.saldoCuenta > 0.009)
      .sort((a, b) => b.saldoCuenta - a.saldoCuenta);

    const totalPendiente = Math.round(
      deudores.reduce((total, c) => total + c.saldoCuenta, 0) * 100
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
});router.get('/cuentas/:id',staff,async(req,res,next)=>{try{if(!validId(req.params.id))return err(res,'Alumno inválido');const c=await Cliente.findById(req.params.id);if(!c)return err(res,'Alumno no encontrado');const cuenta=await saldo(c._id);render(res,'account-detail',{c,cuenta})}catch(e){next(e)}});
router.post('/cuentas/venta',staff,async(req,res,next)=>{try{const alumnoId=str(req.body.alumnoId),productoId=str(req.body.productoId),cantidad=Number(req.body.cantidad),modalidad=str(req.body.modalidad),medio=str(req.body.medio);if(!validId(alumnoId)||!validId(productoId)||!Number.isInteger(cantidad)||cantidad<1||cantidad>100||!['ahora','cuenta'].includes(modalidad))return err(res,'Datos de venta inválidos');if(!await Cliente.exists({_id:alumnoId}))return err(res,'Alumno inexistente');if(modalidad==='ahora'&&!['Efectivo','Transferencia','Mercado Pago','Otro'].includes(medio))return err(res,'Medio de pago inválido');const prod=await Producto.findOneAndUpdate({_id:productoId,activo:true,stock:{$gte:cantidad}},{$inc:{stock:-cantidad}},{new:false});if(!prod)return err(res,'Stock insuficiente');const total=Math.round(prod.precioVenta*cantidad*100)/100;if(total<0){await Producto.updateOne({_id:productoId},{$inc:{stock:cantidad}});return err(res,'Precio inválido')};let venta;try{venta=await Venta.create({producto:prod._id,nombreProducto:prod.nombre,cantidad,precioUnitario:prod.precioVenta,total,metodoPago:modalidad==='cuenta'?'Otro':medio,alumno:alumnoId,aCuenta:modalidad==='cuenta',actor:req.session.actor,observacion:modalidad==='cuenta'?'Cuenta corriente':'Pago inmediato'});if(modalidad==='cuenta')await Mov.create({alumno:alumnoId,tipo:'cargo',importe:total,descripcion:prod.nombre+' x'+cantidad,producto:prod._id,cantidad,venta:venta._id,actor:req.session.actor,operacion:crypto.randomUUID()})}catch(e){if(venta)await Venta.deleteOne({_id:venta._id});await Producto.updateOne({_id:productoId},{$inc:{stock:cantidad}});throw e}res.redirect('/cuentas/'+alumnoId)}catch(e){next(e)}});
router.post('/cuentas/pago',staff,async(req,res,next)=>{try{const id=str(req.body.alumnoId),importe=Number(req.body.importe),medio=str(req.body.medio);if(!validId(id)||!Number.isFinite(importe)||importe<=0||!['Efectivo','Transferencia','Mercado Pago','Otro'].includes(medio))return err(res,'Pago inválido');const cuenta=await saldo(id);if(importe>cuenta.total+0.001)return err(res,'El pago supera el saldo pendiente');await Mov.create({alumno:id,tipo:'pago',importe:Math.round(importe*100)/100,descripcion:'Pago de cuenta corriente',medio,actor:req.session.actor,operacion:crypto.randomUUID()});res.redirect('/cuentas/'+id)}catch(e){next(e)}});
// ========================================
// JP 2.0 - MENSAJES DEL PROFESOR
// ========================================

// Enviar mensaje individual o grupal
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
      return err(res, 'Completá el título y el mensaje.');
    }

    if (!['individual', 'grupal'].includes(destinatario)) {
      return err(res, 'Seleccioná un destinatario válido.');
    }

    let alumno = null;

    if (destinatario === 'individual') {

      if (!validId(alumnoId)) {
        return err(res, 'Seleccioná un alumno válido.');
      }

      const existe = await Cliente.exists({
        _id: alumnoId,
        accesoApp: true
      });

      if (!existe) {
        return err(res, 'El alumno no tiene acceso a la aplicación.');
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


// Obtener mensajes del alumno
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


// Marcar mensaje como leído
router.post('/mi-app/mensajes/:id/leido', alumno, async (req, res, next) => {

  try {

    const id = str(req.params.id);
    const alumnoId = req.session.uid;

    if (!validId(id)) {
      return res.status(400).json({
        ok: false,
        error: 'Mensaje inválido'
      });
    }

    const resultado = await MensajeProfesor.updateOne({

      _id: id,
      activo: true,

      $or: [
        { destinatario: 'grupal' },
        {
          destinatario: 'individual',
          alumno: alumnoId
        }
      ]

    }, {

      $addToSet: {
        leidoPor: alumnoId
      }

    });

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

});
// ========================================
// JP 2.0 - SEGUIMIENTO DE ENTRENAMIENTOS
// ========================================

function fechaArgentina() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

// Obtener el progreso del alumno correspondiente a hoy
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

// Guardar ejercicio realizado
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

    if (!rutina || ejercicioIndex >= rutina.ejercicios.length) {
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

    // Si la rutina fue modificada, sincronizamos sus ejercicios.
    if (registro.ejercicios.length !== rutina.ejercicios.length) {
      registro.ejercicios = rutina.ejercicios.map(e => ({
        nombre: e.nombre,
        completado: false
      }));
    }

    registro.ejercicios[ejercicioIndex].completado = completado;
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

// Consultar historial desde el panel del profesor
router.get('/profesor/progreso/:alumnoId', staff, async (req, res, next) => {
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
      .sort({ fecha: -1, actualizado: -1 })
      .limit(60)
      .lean();

    res.json({
      ok: true,
      alumno: `${cliente.nombre} ${cliente.apellido}`,
      registros: registros.map(r => {
        const total = r.ejercicios.length;
        const completados = r.ejercicios.filter(e => e.completado).length;

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
});
module.exports=router;
