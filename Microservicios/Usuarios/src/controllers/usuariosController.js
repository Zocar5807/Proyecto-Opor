require('dotenv').config();
const express = require('express');
const router = express.Router();
const usuariosModel = require('../models/usuariosModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';

// --- PING ---
router.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Microservicio Usuarios - OK' });
});

// --- LISTAR USUARIOS ---
router.get('/', async (req, res) => {
  try {
    const result = await usuariosModel.traerUsuarios();
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});


// --- TRAER USUARIO POR ID ---
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user = await usuariosModel.traerUsuarioPorId(id);
    if (!user) return res.status(404).json({ ok:false, msg: 'Usuario no encontrado' });
    res.json({ ok: true, data: user });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- 🔹 TRAER USUARIO POR CÉDULA ---
router.get('/cedula/:cedula', async (req, res) => {
  try {
    const cedula = req.params.cedula;
    const user = await usuariosModel.traerUsuarioPorCedula(cedula);
    if (!user) return res.status(404).json({ ok:false, msg: 'Usuario no encontrado' });
    res.json({ ok: true, data: user });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- CREAR USUARIO ---
router.post('/', async (req, res) => {
  try {
    const { cedula, nombres, apellidos, username, password, telefono, email, direccion, rol } = req.body;

    if (!cedula || !nombres || !apellidos || !username || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoUsuario = {
      cedula,
      nombres,
      apellidos,
      username,
      password: hashedPassword,
      telefono,
      email,
      direccion,
      rol: rol || 'cliente',
      estado: 'activo'
    };

    const created = await usuariosModel.crearUsuario(nuevoUsuario);
    res.status(201).json({ ok: true, msg: 'Usuario creado', data: created });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ ok: false, msg: 'Error creando usuario', error: err.message });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await usuariosModel.validarUsuario(username, password);
    if (!user) return res.status(401).json({ ok:false, msg: 'Credenciales inválidas' });

    const token = jwt.sign({
      id: user.usu_codigo,
      nombre: user.nombres,
      apellidos: user.apellidos,
      cedula: user.cedula,
      username: user.username,
      direccion: user.direccion,
      rol: user.rol,
      email: user.email,
      telefono: user.telefono
    }, JWT_SECRET, { expiresIn: '2h' });

    res.json({ ok:true, token });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// --- ACTUALIZAR USUARIO ---
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const datos = req.body;

    if (!datos || Object.keys(datos).length === 0) {
      return res.status(400).json({ ok: false, msg: 'No se enviaron datos para actualizar' });
    }

    // No permitir que cambien el ID o el estado directamente por aquí
    delete datos.usu_codigo;
    delete datos.id;
    delete datos.estado;
    delete datos.deleted_at;
    delete datos.created_at;
    delete datos.updated_at;

    // Si viene password, la encriptamos antes de guardar
    if (datos.password) {
      const bcrypt = require('bcrypt');
      datos.password = await bcrypt.hash(datos.password, 10);
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
// DELETE /usuarios/:id
router.delete('/:id', async (req, res) => {
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
