require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const app = express();
//importar las librerias
//definir las rutas
const usuariosRouter = require('./src/controllers/usuariosController');

app.use(morgan('dev')); 
app.use(cors());
app.use(express.json({ limit: '2mb' })); //no creo que haya motivo para ponerle limite por lo que no se expresa
app.use('/api/usuarios', usuariosRouter);


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Usuarios service listening on ${PORT}`));