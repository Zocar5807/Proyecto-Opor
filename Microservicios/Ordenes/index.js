const express = require('express');
const ordenesController = require('./src/controllers/ordenesController');
const morgan = require('morgan');
const cors = require('cors');
const app = express();

app.use(morgan('dev'));
app.use(express.json());

const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('/api/ordenes', cors(corsOptions));

app.use('/api/ordenes', ordenesController);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Microservicio de ordenes escuchando en el puerto ${PORT}`);
});