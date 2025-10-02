const express = require('express');
const ordenesController = require('./src/controllers/ordenesController');
const morgan = require('morgan');
const cors = require('cors');
const app = express();

app.use(morgan('dev'));
app.use(express.json());

// Habilitar CORS para preflight y peticiones
const corsOptions = {
  origin: true, // refleja el Origin que llega (útil en desarrollo)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
// Manejar preflight específicamente para el prefijo de órdenes
app.options('/api/ordenes', cors(corsOptions));

app.use('/api/ordenes', ordenesController);

app.listen(3003, () => {
  console.log('Microservicio de ordenes escuchando en el puerto 3003');
});