require('dotenv').config(); //require() es de node.js y se usa para importar o una libreria o un archivo, imagino q es como el
//import de python lo que esta dentro del () es la libreria, en este caso dotenv que es para manejar variables de entorno
//.config() le dice a dotenv que guarde esas configuraciones en process.env
const express = require('express'); // const es para guardar un valor como una constante, no puede cambiar su referencia
//por ejemplo si const numero = 5 numero no puede ser 10 ya que es una constante esto es mas especifico q python
//Aqui guardamos express que es un framework para levantar un servidor con node.js, es una caja de herramientas bacikmente
const morgan = require('morgan'); // lo mismo pero con morgan, lo que hace q se puedan ver las peticiones http en la consola
const cors = require('cors'); //permite conectar la api con otro lugar, por ekemplo ennel frontend con fetch("http//localhost:3005/")
const contratosController = require('./src/controllers/contratosController'); // ya no traemos una libreria sino un archivo
//traemos el controller q tiene las rutas que va a entender la api, por ejemplo contratos/id contratos/crear o cosas asi
const app = express(); //ejecutamos express y nos devuelve la constante que es un objeto llamado app
//esto es nuestro servidor web, podremos decidir que hacer con cada peticion, que middleware usar y     en que puerto escuchar


app.use(morgan('dev')); //app.use sirve para registrar un middleware(son funciones que se ejecutan entre cuando llega la peticion
// y yo doy la respuesta) en este caso el middleware es morgan('dev') dev es solo un formato para el log
app.use(cors());
app.use(express.json()); //cuando en postman hagamos el cuerpo de la peticion en json por ejemplo {'nombre': "contrato1"} express.json
// te hara poderlo leer de forma req.body.nombre ||contrato1
app.use('/api/contratos', contratosController); //esto monta todas las rutas, y le dice a controler que cada ruta que haya empeiza
//con /api/contratos

const PORT = process.env.PORT || 3005; // SE CREA EL PORT COMO CONSTANTE y se entrega el port que esta configurado en process.env
// si no se encuentra variable .PORT pone 3005 por defecto


app.listen(PORT,() => {
  console.log(`Microservicio Contratos escuchando en el puerto ${PORT}`);
});



