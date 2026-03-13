const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');

const clientesRoutes = require('./routes/clientes');
const productosRoutes = require('./routes/productos');
const ventasRoutes = require('./routes/ventas');
const gastosRoutes = require('./routes/gastos');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configurar sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'jp-entrenamiento',
  resave: false,
  saveUninitialized: false
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
  res.render('login');
});

app.post('/login', (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    // Usuario y contraseña fijos
    if (usuario === 'jpentrenamiento' && contrasena === 'burack123') {
      req.session.usuario = usuario;
      return res.redirect('/');
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