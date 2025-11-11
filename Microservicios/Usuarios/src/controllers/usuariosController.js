require('dotenv').config();
const express = require('express');
const router = express.Router();
const usuariosModel = require('../models/usuariosModel');
const jwt = require('jsonwebtoken');
const { authenticateJWT, requireAdmin } = require('../auth/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';

function esAdmin(req) {
  const rol = req.user?.rol;
  return rol && String(rol).toLowerCase() === 'admin';
}

function esEmpleado(req) {
  const rol = req.user?.rol;
  return rol && String(rol).toLowerCase() === 'empleado';
}

function asegurarPropietario(req, res, next) {
  const solicitanteId = Number(req.user?.id);
  const objetivoId = Number(req.params.id);
  if (Number.isNaN(objetivoId)) {
    return res.status(400).json({ ok: false, msg: 'ID inválido' });
  }

  if (esAdmin(req) || solicitanteId === objetivoId) {
    return next();
  }

  return res.status(403).json({ ok: false, msg: 'No tienes permiso para esta operación' });
}

function asegurarAccesoPorCedula(req, res, next) {
  if (esAdmin(req) || esEmpleado(req)) {
    return next();
  }
  return res.status(403).json({ ok: false, msg: 'Solo personal autorizado puede consultar por cédula' });
}

// --- PING ---
router.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Microservicio Usuarios - OK' });
});

// --- LISTAR USUARIOS (solo admins) ---
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const result = await usuariosModel.traerUsuarios();
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- USUARIO ACTUAL ---
router.get('/me', authenticateJWT, async (req, res) => {
  try {
    const user = await usuariosModel.traerUsuarioPorId(req.user.id);
    if (!user) return res.status(404).json({ ok:false, msg: 'Usuario no encontrado' });
    res.json({ ok: true, data: user });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- TRAER USUARIO POR CÉDULA (solo staff) ---
router.get('/cedula/:cedula', authenticateJWT, asegurarAccesoPorCedula, async (req, res) => {
  try {
    const cedula = req.params.cedula;
    const user = await usuariosModel.traerUsuarioPorCedula(cedula);
    if (!user) return res.status(404).json({ ok:false, msg: 'Usuario no encontrado' });
    res.json({ ok: true, data: user });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- TRAER USUARIO POR ID (propietario o admin) ---
router.get('/:id', authenticateJWT, asegurarPropietario, async (req, res) => {
  try {
    const id = req.params.id;
    const user = await usuariosModel.traerUsuarioPorId(id);
    if (!user) return res.status(404).json({ ok:false, msg: 'Usuario no encontrado' });
    res.json({ ok: true, data: user });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- REGISTRO DE CLIENTES ---
router.post('/', async (req, res) => {
  try {
    const {
      cedula,
      nombres,
      apellidos,
      username,
      password,
      telefono,
      email,
      direccion,
      ciudad,
      preferencias
    } = req.body || {};

    if (!cedula || !nombres || !apellidos || !username || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }

    const nuevoUsuario = await usuariosModel.crearUsuario({
      cedula,
      nombres,
      apellidos,
      username,
      password,
      telefono,
      email,
      direccion,
      ciudad,
      preferencias: preferencias && typeof preferencias === 'object' ? preferencias : {},
      rol: 'cliente',
      estado: 'activo'
    });

    res.status(201).json({ ok: true, msg: 'Usuario registrado', data: nuevoUsuario });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ ok: false, msg: 'Error creando usuario', error: err.message });
  }
});

// --- CREAR EMPLEADO (solo admin) ---
router.post('/empleados', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const {
      cedula,
      nombres,
      apellidos,
      username,
      password,
      telefono,
      email,
      direccion,
      ciudad,
      preferencias
    } = req.body || {};

    if (!cedula || !nombres || !apellidos || !username || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }

    const nuevoUsuario = await usuariosModel.crearUsuario({
      cedula,
      nombres,
      apellidos,
      username,
      password,
      telefono,
      email,
      direccion,
      ciudad,
      preferencias: preferencias && typeof preferencias === 'object' ? preferencias : {},
      rol: 'empleado',
      estado: 'activo'
    });

    res.status(201).json({ ok: true, msg: 'Empleado creado', data: nuevoUsuario });
  } catch (err) {
    console.error('Error creando empleado:', err);
    res.status(500).json({ ok: false, msg: 'Error creando empleado', error: err.message });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, msg: 'Usuario y contraseña son obligatorios' });
    }

    const user = await usuariosModel.validarUsuario(username, password);
    if (!user) return res.status(401).json({ ok:false, msg: 'Credenciales inválidas' });

    const tokenPayload = {
      id: user.usu_codigo,
      nombres: user.nombres,
      apellidos: user.apellidos,
      cedula: user.cedula,
      username: user.username,
      direccion: user.direccion,
      rol: user.rol,
      email: user.email || '',
      telefono: user.telefono || '',
      preferencias: user.preferencias || {}
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '2h' });

    res.json({ ok:true, data: { token, user } });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- ACTUALIZAR USUARIO ---
router.put('/:id', authenticateJWT, asegurarPropietario, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const datos = req.body || {};

    if (!datos || Object.keys(datos).length === 0) {
      return res.status(400).json({ ok: false, msg: 'No se enviaron datos para actualizar' });
    }

    delete datos.usu_codigo;
    delete datos.id;
    delete datos.deleted_at;
    delete datos.created_at;
    delete datos.updated_at;
    // El estado solo lo puede cambiar un admin
    if (!esAdmin(req)) delete datos.estado;
    if (!esAdmin(req)) delete datos.rol;

    if (datos.preferencias && typeof datos.preferencias !== 'object') {
      return res.status(400).json({ ok:false, msg:'Preferencias debe ser un objeto' });
    }

    const updatedUser = await usuariosModel.actualizarUsuario(id, datos);

    if (!updatedUser) {
      return res.status(404).json({ ok: false, msg: 'Usuario no encontrado o eliminado' });
    }

    res.json({ ok: true, msg: 'Usuario actualizado', data: updatedUser });
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    res.status(500).json({ ok: false, msg: 'Error actualizando usuario', error: err.message });
  }
});

// --- ELIMINAR USUARIO (soft delete) ---
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await usuariosModel.eliminarUsuario(id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
    }

    res.json({ ok: true, msg: 'Usuario eliminado (soft delete)' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
