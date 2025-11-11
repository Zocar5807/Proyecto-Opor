// controllers/ordenesController.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticateJWT, requireAdmin } = require('../middlewares/authMiddleware');
const ordenesModel = require('../models/ordenesModel');
const pool = require('../db');

// URLs de otros microservicios (desde .env)
const USUARIOS_URL = process.env.USUARIOS_URL || 'http://localhost:3001/api/usuarios';
const PRODUCTOS_URL = process.env.PRODUCTOS_URL || 'http://localhost:3002/api/productos';

// Crear una orden
router.post('/', authenticateJWT, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { items } = req.body; // items = [{ id, cantidad }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, msg: 'Debe enviar productos en items' });
    }

    // Obtener info de usuario desde microservicio usuarios
    const usuarioId = req.user.id;
    const userResp = await axios.get(`${USUARIOS_URL}/${usuarioId}`, {
      headers: { Authorization: req.headers['authorization'] }
    });
    if (!userResp.data || !userResp.data.data) {
      return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
    }
    const usuario = userResp.data.data;

    // Verificar productos y calcular total
    let totalCuenta = 0;
    const productosDetalle = [];
    for (const item of items) {
      const prodResp = await axios.get(`${PRODUCTOS_URL}/${item.id}`);
      if (!prodResp.data || !prodResp.data.data) {
        return res.status(404).json({ ok: false, msg: `Producto ${item.id} no encontrado` });
      }
      const prod = prodResp.data.data;
      if (prod.cantidad < item.cantidad) {
        return res.status(400).json({ ok: false, msg: `Stock insuficiente para ${prod.nombre}` });
      }
      const subtotal = prod.precio * item.cantidad;
      totalCuenta += subtotal;
      productosDetalle.push({
        id: prod.id,
        nombre: prod.nombre,
        precio: prod.precio,
        cantidad: item.cantidad,
        subtotal
      });
    }

    // Iniciar transacción
    await conn.beginTransaction();

    const orden = {
      idUsuario: usuario.usu_codigo,
      nombresCliente: usuario.nombres,
      apellidosCliente: usuario.apellidos,
      cedulaCliente: usuario.cedula,
      emailCliente: usuario.email || req.user.email,
      telefonoCliente: usuario.telefono || req.user.telefono,
      direccionCliente: usuario.direccion || req.user.direccion,
      usernameCliente: usuario.username,
      productos: productosDetalle,
      totalCuenta,
      fechaCreacion: new Date()
    };

    const result = await ordenesModel.crearOrden(orden, conn);

    // Actualizar stock en productos o eliminar si llega a 0
    for (const item of productosDetalle) {
      const prodResp = await axios.get(`${PRODUCTOS_URL}/${item.id}`);
      const prodActual = prodResp.data.data;
      const updatedCantidad = prodActual.cantidad - item.cantidad;

      if (updatedCantidad <= 0) {
        //}}Eliminar producto si stock llega a 0
        await axios.delete(`${PRODUCTOS_URL}/${item.id}`, {
          headers: { Authorization: req.headers['authorization'] }
        });
      } else {
        //aaaActualizar stock normalmente
        await axios.patch(`${PRODUCTOS_URL}/${item.id}/cantidad`, { cantidad: updatedCantidad }, {
          headers: { Authorization: req.headers['authorization'] }
        });
      }
    }

    await conn.commit();
    res.status(201).json({ ok: true, msg: 'Orden creada', data: { id_orden: result.idOrden, ...result } });
  } catch (err) {
    await conn.rollback();
    console.error('Error POST /ordenes', err);
    res.status(500).json({ ok: false, msg: 'Error creando orden', error: err.message });
  } finally {
    conn.release();
  }
});

// GET /ordenes/:id
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const order = await ordenesModel.traerOrden(id); // devuelve objeto o null
    if (!order) {
      return res.status(404).json({ ok: false, msg: 'Orden no encontrada' });
    }
    res.json({ ok: true, data: order });
  } catch (err) {
    console.error('Error GET /ordenes/:id', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo orden', error: err.message });
  }
});

// GET /ordenes (si ?mine=true filtra por usuario autenticado)
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const soloMias = String(req.query.mine || '').toLowerCase() === 'true';
    const result = soloMias
      ? await ordenesModel.traerOrdenesPorUsuario(req.user.id)
      : await ordenesModel.traerOrdenes();
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error('Error GET /ordenes', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo ordenes', error: err.message });
  }
});

// PATCH /ordenes/:id -> actualizar estado (admin o dueño de la orden)
router.patch('/:id', authenticateJWT, async (req, res) => {
  const id = req.params.id;
  const nuevoEstado = (req.body && (req.body.status || req.body.estado)) || null;
  if (!nuevoEstado) {
    return res.status(400).json({ ok:false, msg:'Debe enviar status/estado' });
  }
  
  const conn = await pool.getConnection();
  try {
    // Verificar que la orden existe y obtener el id_usuario
    const [ordenRows] = await conn.query('SELECT id_usuario FROM ordenes WHERE id_orden = ?', [id]);
    if (ordenRows.length === 0) {
      return res.status(404).json({ ok:false, msg:'Orden no encontrada' });
    }
    
    const ordenUsuarioId = ordenRows[0].id_usuario;
    const usuarioActualId = req.user.id;
    const usuarioRaw = req.user.raw || {};
    const rolToken = String(req.user.rol || req.user.role || '').toLowerCase();
    const nivel = usuarioRaw.usu_nivel;
    const rolRaw = String(usuarioRaw.rol || '').toLowerCase();
    const esAdmin = rolToken === 'admin' || rolRaw === 'admin' || Number(nivel) === 5;
    const esEmpleado = rolToken === 'empleado' || rolRaw === 'empleado' || Number(nivel) === 4;
    
    // Verificar permisos: admin o empleado pueden cambiar cualquier orden, el cliente solo la suya
    const puedeEditar = esAdmin || esEmpleado || (ordenUsuarioId && ordenUsuarioId === usuarioActualId);
    
    if (!puedeEditar) {
      return res.status(403).json({ 
        ok:false, 
        msg:'No tienes permiso para modificar esta orden',
        debug: {
          ordenUsuarioId,
          usuarioActualId,
          esAdmin,
          puedeEditar
        }
      });
    }
    
    // Si es cliente (no admin ni empleado), solo puede cancelar
    if (!esAdmin && !esEmpleado) {
      const nuevoEstadoLower = String(nuevoEstado).toLowerCase();
      if (nuevoEstadoLower !== 'cancelado' && nuevoEstadoLower !== 'cancelar') {
        return res.status(403).json({ 
          ok:false, 
          msg:'Los clientes solo pueden cancelar sus órdenes, no cambiar a otros estados'
        });
      }
    }
    
    await conn.beginTransaction();
    try {
      const [result] = await conn.execute('UPDATE ordenes SET estado = ? WHERE id_orden = ?', [String(nuevoEstado), id]);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ ok:false, msg:'Orden no encontrada' });
      }
    } catch (err) {
      // Si la columna no existe, la creamos y reintentamos
      const msg = err && (err.code || err.message || '');
      if (String(msg).includes('Unknown column') || String(msg).includes('ER_BAD_FIELD_ERROR')) {
        await conn.execute('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS estado VARCHAR(32) NULL');
        const [result2] = await conn.execute('UPDATE ordenes SET estado = ? WHERE id_orden = ?', [String(nuevoEstado), id]);
        if (result2.affectedRows === 0) {
          await conn.rollback();
          return res.status(404).json({ ok:false, msg:'Orden no encontrada' });
        }
      } else {
        throw err;
      }
    }
    await conn.commit();
    return res.json({ ok:true, msg:'Estado actualizado', id, estado:nuevoEstado });
  } catch (err) {
    await conn.rollback();
    console.error('Error PATCH /ordenes/:id', err);
    return res.status(500).json({ ok:false, msg:'Error actualizando estado', error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
