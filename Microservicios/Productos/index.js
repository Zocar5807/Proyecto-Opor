require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const productosController = require('./src/controllers/productosController');

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

app.use('/api/productos', productosController);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Microservicio Productos escuchando en el puerto ${PORT}`);
});
