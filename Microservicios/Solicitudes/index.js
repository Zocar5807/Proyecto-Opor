require('dotenv').config();
const express = require('express');
const cors = require('cors');
const solicitudesRouter = require('./src/controllers/solicitudesController');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/solicitudes', solicitudesRouter);

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`Solicitudes service listening on ${PORT}`));
