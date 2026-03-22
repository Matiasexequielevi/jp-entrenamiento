const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const clientesRoutes = require('./routes/clientes');
const productosRoutes = require('./routes/productos');
const ventasRoutes = require('./routes/ventas');
const gastosRoutes = require('./routes/gastos');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Si usás Render u otro proxy en producción
app.set('trust proxy', 1);

// Configurar sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'jp-entrenamiento',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 30 // 30 días
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // true en producción con https
    sameSite: 'lax'
  }
}));

// Middleware para proteger rutas
function verificarLogin(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.redirect('/login');
}

// Rutas públicas
app.get('/login', (req, res) => {
  if (req.session && req.session.usuario) {
    return res.redirect('/');
  }
  res.render('login');
});

app.post('/login', (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    // Usuario y contraseña fijos
    if (usuario === 'jpentrenamiento' && contrasena === 'burack123') {
      req.session.usuario = usuario;

      req.session.save((err) => {
        if (err) {
          console.error('❌ Error al guardar sesión:', err);
          return res.status(500).send('Error al guardar la sesión');
        }
        return res.redirect('/');
      });

      return;
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

// Rutas protegidas
app.use('/', verificarLogin, clientesRoutes);
app.use('/productos', verificarLogin, productosRoutes);
app.use('/ventas', verificarLogin, ventasRoutes);
app.use('/gastos', verificarLogin, gastosRoutes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});