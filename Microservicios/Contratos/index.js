require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const contratosController = require('./src/controllers/contratosController');

const app = express();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use('/api/contratos', contratosController);

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Microservicio Contratos escuchando en el puerto ${PORT}`);
});
