const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');

const clientesRoutes = require('./routes/clientes');
const productosRoutes = require('./routes/productos');
const ventasRoutes = require('./routes/ventas');
const gastosRoutes = require('./routes/gastos');
const { iniciarWhatsApp } = require('./services/whatsapp');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

/* =========================
   Configuración general
   ========================= */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* =========================
   Trust proxy para Render
   ========================= */
app.set('trust proxy', 1);

/* =========================
   Configuración de sesión
   ========================= */
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'jp-entrenamiento',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
};

try {
  const MongoStoreModule = require('connect-mongo');
  const MongoStore = MongoStoreModule.default || MongoStoreModule;

  if (MongoStore && typeof MongoStore.create === 'function') {
    sessionConfig.store = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 30
    });
    console.log('✅ Sesiones guardadas en MongoDB');
  } else {
    console.log('⚠️ connect-mongo no soporta create(). Se usará sesión en memoria temporalmente.');
  }
} catch (error) {
  console.log('⚠️ connect-mongo no disponible. Se usará sesión en memoria temporalmente.');
}

app.use(session(sessionConfig));

/* =========================
   Middleware de login
   ========================= */
function verificarLogin(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.redirect('/login');
}

/* =========================
   Rutas públicas
   ========================= */
app.get('/login', (req, res) => {
  if (req.session && req.session.usuario) {
    return res.redirect('/');
  }
  return res.render('login');
});

app.post('/login', (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    if (usuario === 'jpentrenamiento' && contrasena === 'burack123') {
      req.session.usuario = usuario;

      return req.session.save((err) => {
        if (err) {
          console.error('❌ Error al guardar sesión:', err);
          return res.status(500).send('Error al guardar la sesión');
        }

        return res.redirect('/');
      });
    }

    return res.status(401).send('Usuario o contraseña incorrectos');
  } catch (error) {
    console.error('❌ Error en login:', error);
    return res.status(500).send('Error al iniciar sesión');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('❌ Error al cerrar sesión:', error);
      return res.status(500).send('Error al cerrar sesión');
    }

    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
});

/* =========================
   Rutas protegidas
   ========================= */
app.use('/', verificarLogin, clientesRoutes);
app.use('/productos', verificarLogin, productosRoutes);
app.use('/ventas', verificarLogin, ventasRoutes);
app.use('/gastos', verificarLogin, gastosRoutes);

/* =========================
   Conexión a MongoDB + inicio servidor
   ========================= */
async function iniciarServidor() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('Falta la variable MONGODB_URI en el entorno');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);

      const whatsappEnabled =
        String(process.env.WHATSAPP_ENABLED || '').trim().toLowerCase() === 'true';

      if (whatsappEnabled) {
        console.log('🟢 Iniciando módulo de WhatsApp...');
        try {
          iniciarWhatsApp();
        } catch (error) {
          console.error('❌ Error al iniciar WhatsApp:', error.message);
        }
      } else {
        console.log('⚪ WhatsApp desactivado desde .env');
        console.log('Valor detectado:', process.env.WHATSAPP_ENABLED);
      }
    });
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error.message);
    process.exit(1);
  }
}

iniciarServidor();