require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const usuariosRouter = require('./src/controllers/usuariosController');

const app = express();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api/usuarios', usuariosRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Usuarios service listening on ${PORT}`));