// src/controllers/contratosController.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth')
const jwt = require('jsonwebtoken');

const contratosModel = require('../models/contratosModel');
const pool = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';

const { authenticateJWT, authorizeRole } = require('../middleware/auth');
const { JsonWebTokenError } = require('jsonwebtoken');

const SOLICITUDES_URL = process.env.SOLICITUDES_URL || 'http://localhost:3004';
const PRODUCTOS_URL = process.env.PRODUCTOS_URL || 'http://localhost:3002';

// ----------------- helpers (validaciones + logging) -----------------
function isValidPercentage(v) {
  if (v === undefined || v === null || v === '') return true;
  const n = Number(v);
  return !Number.isNaN(n) && n >= 0 && n <= 100;
}
function isPositiveNumber(v) {
  if (v === undefined || v === null || v === '') return false;
  const n = Number(v);
  return !Number.isNaN(n) && n > 0;
}
function isValidDateString(v) {
  if (!v) return true;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}
function ensureLogsFolder() {
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  return logsDir;
}
async function logFailedProductActionToStorage(payload) {
  try {
    const logsDir = ensureLogsFolder();
    const filePath = path.join(logsDir, 'failed_product_actions.log');
    fs.appendFileSync(filePath, JSON.stringify(payload) + '\n');

    const sql = `
      INSERT INTO producto_accion_pendiente
      (contrato_id, producto_id, accion, payload_json, error_message, created_at, attempts)
      VALUES (?, ?, ?, ?, ?, NOW(), ?)
    `;
    const params = [
      payload.contratoId || null,
      payload.productoId || null,
      payload.action || null,
      JSON.stringify(payload) || null,
      payload.detail || null,
      payload.attempts || 0
    ];
    await pool.execute(sql, params);
  } catch (err) {
    console.error('Error guardando accion pendiente:', err.message || err);
  }
}

// ----------------- rutas -----------------
// Auth opcional: si hay token válido, setea req.user; si no, continua sin error
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return next();
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return next();
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id,
      rol: payload.rol || payload.role,
      nombre: payload.nombre || payload.name,
    };
  } catch (e) {
    // ignoramos token inválido en modo opcional
  }
  return next();
}

// ping
router.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Microservicio de Contratos funcionando ' });
});


// Crear contrato -> requiere autenticación (usuario)
router.post('/', authenticateJWT, async (req, res) => {
  console.log('📥 Body recibido en Contratos:', JSON.stringify(req.body, null, 2));

  try {
    const body = req.body;
    // Ajustar para priorizar solicitud_id (snake_case) como en el payload recibido
    const solicitudId = body.solicitud_id || body.solicitudId;
    if (!solicitudId) {
      console.warn('Falta solicitudId en el body:', JSON.stringify(body));
      return res.status(400).json({ ok: false, msg: 'Falta solicitudId o solicitud_id en el body' });
    }

    // Convertir a número si es string (evitar errores en la URL)
    const solicitudIdNum = Number(solicitudId);
    if (isNaN(solicitudIdNum)) {
      console.warn('solicitudId no es un número válido:', solicitudId);
      return res.status(400).json({ ok: false, msg: 'solicitudId debe ser un número válido' });
    }

    const monto = body.con_valor || body.monto_aprobado;
    if (!isPositiveNumber(monto)) {
      console.warn('con_valor inválido:', monto);
      return res.status(400).json({ ok: false, msg: 'con_valor (monto aprobado) debe ser un número > 0' });
    }
    if (!isValidPercentage(body.con_tasa)) {
      console.warn('con_tasa inválido:', body.con_tasa);
      return res.status(400).json({ ok: false, msg: 'con_tasa debe ser un número entre 0 y 100' });
    }
    if (body.con_tiempo !== undefined && (!Number.isInteger(Number(body.con_tiempo)) || Number(body.con_tiempo) <= 0)) {
      console.warn('con_tiempo inválido:', body.con_tiempo);
      return res.status(400).json({ ok: false, msg: 'con_tiempo debe ser entero positivo' });
    }
    if (!isValidDateString(body.con_fecha_plazo)) {
      console.warn('con_fecha_plazo inválido:', body.con_fecha_plazo);
      return res.status(400).json({ ok: false, msg: 'con_fecha_plazo debe ser una fecha válida (YYYY-MM-DD)' });
    }

    // Re-firmar un token fresco basado en req.user para llamadas internas
    const internalToken = jwt.sign(
      {
        id: req.user.id,
        rol: req.user.role,
        nombre: req.user.name
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log('Token usado para llamar a Solicitudes:', internalToken.substring(0, 20) + '...');

    const solicitudResponse = await axios.get(`${SOLICITUDES_URL}/api/solicitudes/${solicitudIdNum}`, {
      headers: { Authorization: `Bearer ${internalToken}` }
    });
    console.log('Respuesta de Solicitudes:', JSON.stringify(solicitudResponse.data, null, 2));
    const solicitud = solicitudResponse.data.data || solicitudResponse.data;
    if (!solicitud || !['aprobado', 'aprobada'].includes((solicitud.estado || '').toLowerCase())) {
      console.warn('Solicitud no aprobada o no encontrada:', solicitud);
      return res.status(400).json({ ok: false, msg: 'Solicitud no aprobada o no encontrada' });
    }

    const estadoSolicitud = (solicitud.estado || '').toString().toLowerCase();
    if (!['aprobada', 'aprobado', 'a'].includes(estadoSolicitud)) {
      console.warn('Estado de solicitud inválido:', estadoSolicitud);
      return res.status(400).json({ ok: false, msg: 'La solicitud debe estar aprobada para crear contrato' });
    }

    // Ajuste: Extraer cliente directamente desde los campos raíz de solicitud
    const cliente = {
      id: solicitud.usuario_id || solicitud.id || null,
      cedula: solicitud.cedula || null,
      nombre: `${solicitud.nombre || ''} ${solicitud.apellidos || ''}`.trim() || null,
    };

    // Ajustar la extracción del producto desde los campos raíz de data
    const productoDesdeSolicitud = {
      nombre: solicitud.nombre_producto || 'Producto desde solicitud',
      descripcion: solicitud.descripcion || '',
      categoria: solicitud.categoria || 'Sin categoria',
      imagenes: solicitud.imagenes || []
    };
    if (!productoDesdeSolicitud.nombre) {
      console.warn('Producto no encontrado en solicitud:', productoDesdeSolicitud);
      return res.status(400).json({ ok: false, msg: 'La solicitud no contiene información del producto' });
    }

    // Crear producto en Productos
    const productoPayload = {
      nombre: productoDesdeSolicitud.nombre,
      descripcion: productoDesdeSolicitud.descripcion,
      categoria: productoDesdeSolicitud.categoria,
      imagenes: productoDesdeSolicitud.imagenes,
      estado: 'garantia',
      stock: 1,
      metadata: {
        origen_contrato: true,
        con_numero: body.con_numero || `C-${Date.now()}`,
        solicitud_id: solicitudIdNum
      }
    };
    console.log('Creando producto en Productos con payload:', JSON.stringify(productoPayload, null, 2));  
    const productosResp = await axios.post(`${PRODUCTOS_URL}/api/productos`, productoPayload, { timeout: 7000 });
    const creadoProducto = productosResp.data && (productosResp.data.data || productosResp.data.producto);
    const productoId = creadoProducto && (creadoProducto.id || creadoProducto.insertId);

    if (!productoId) {
      console.error('No se obtuvo productoId de la respuesta de Productos:', productosResp.data);
      return res.status(500).json({ ok: false, msg: 'Error al crear producto en Productos' });
    }

    // Snapshot del producto
    const productoSnapshot = {
      id: productoId,
      nombre: productoPayload.nombre,
      descripcion: productoPayload.descripcion,
      categoria: productoPayload.categoria,
      imagenes: productoPayload.imagenes
    };
    // Crear contrato - Ajustes: priorizar con_sucursal, manejar con_tasa, eliminar con_direccion_cliente
    const contratoData = {
      solicitud_id: solicitudIdNum,
      con_numero: body.con_numero || `C-${Date.now()}`,
      con_cliente: cliente.id || null,
      con_fecha: body.con_fecha || new Date(),
      con_valor: Number(monto),
      con_estado: body.con_estado || 'A',
      con_fecha_plazo: body.con_fecha_plazo || null,
      con_tiempo: body.con_tiempo || null,
      con_tasa: body.con_tasa !== undefined ? Number(body.con_tasa) : null,  // Cambio: null si no se envía
      con_cedula: cliente.cedula || "Sin cedula asociada",
      con_nombre_cliente: cliente.nombre || "Sin nombres asociados",
      con_sucursal: body.con_sucursal || null,  // Cambio: priorizar body.con_sucursal sin fallback a solicitud.sucursal
      producto_id: productoId,
      producto_snapshot: productoSnapshot,
      con_firmado: body.con_firmado ? 1 : 0,
      con_producto_entregado: body.con_producto_entregado ? 1 : 0,
      con_monto_entregado: body.con_monto_entregado ? 1 : 0,
      monto_desembolsado: body.monto_desembolsado !== undefined ? Number(body.monto_desembolsado) : 0,
      con_prestamo_pagado: body.con_prestamo_pagado ? 1 : 0
    };
    console.log('Creando contrato con data:', JSON.stringify(contratoData, null, 2));

    const created = await contratosModel.createContract(contratoData);

    console.info(`Contrato ${created.insertId} creado por user=${req.user ? req.user.id : 'anon'}`);
    return res.status(201).json({
      ok: true,
      msg: 'Contrato creado correctamente',
      contratoId: created.insertId,
      productoId
    });

  } catch (err) {
    console.error('Error en POST /contratos', err.response ? err.response.data : err.message || err);
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json({ ok: false, msg: 'Error en servicio externo', detail: err.response.data });
    }
    return res.status(500).json({ ok: false, msg: 'Error interno al crear contrato', error: err.message });
  }
});




// GET / -> filtros (no requiere auth to read)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const q = req.query;
    const filters = {
      con_cliente: q.con_cliente ? Number(q.con_cliente) : undefined,
      con_cedula: q.con_cedula || undefined,
      estado: q.estado || undefined,
      not_entregado: q.not_entregado === 'true' || q.not_entregado === '1',
      not_firmado: q.not_firmado === 'true' || q.not_firmado === '1',
      fecha_vencimiento_from: q.fecha_vencimiento_from || undefined,
      fecha_vencimiento_to: q.fecha_vencimiento_to || undefined
    };
    // mine=true -> filtrar por usuario del token
    if (String(q.mine || '').toLowerCase() === 'true') {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ ok: false, msg: 'Token requerido para ver tus contratos' });
      }
      filters.con_cliente = req.user.id;
    }
    const contratos = await contratosModel.getContractsByFilters(filters);
    res.json({ ok: true, data: contratos.map(c=>({
      id: c.id,
      estado: c.con_estado,
      fecha: c.con_fecha,
      cliente: c.con_cliente,
      clienteNombre: c.con_nombre_cliente,
      fechaPlazo: c.con_fecha_plazo
    })) });
  } catch (err) {
    console.error('Error en GET /contratos', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error al obtener contratos' });
  }
});

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const contrato = await contratosModel.getContractById(req.params.id);
    if (!contrato) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });
    res.json({ ok: true, data: {
      id: contrato.id,
      estado: contrato.con_estado,
      fecha: contrato.con_fecha,
      cliente: contrato.con_cliente,
      firmado: contrato.con_firmado === 1,
      entregado: contrato.con_producto_entregado === 1,
      monto: contrato.con_valor
    }});
  } catch (err) {
    console.error('Error en GET /contratos/:id', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error al obtener contrato' });
  }
});

// PUT -> update (requires auth)
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const updated = await contratosModel.updateContract(req.params.id, req.body);
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });
    console.info(`Contrato ${req.params.id} actualizado por user=${req.user ? req.user.id : 'anon'}`);
    res.json({ ok: true, msg: 'Contrato actualizado correctamente' });
  } catch (err) {
    console.error('Error en PUT /contratos/:id', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error al actualizar contrato' });
  }
});

// PATCH /:id/estado -> ADMIN only
router.patch('/:id/estado', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  try {
    const { nuevoEstado, prestamo_pagado } = req.body;
    const id = req.params.id;

    if (!nuevoEstado && prestamo_pagado === undefined) {
      return res.status(400).json({ ok: false, msg: 'Debes enviar nuevoEstado o prestamo_pagado' });
    }

    const allowedStates = ['A', 'V', 'C', 'R', 'P'];
    if (nuevoEstado && !allowedStates.includes(nuevoEstado)) {
      return res.status(400).json({ ok: false, msg: `nuevoEstado inválido. Permitidos: ${allowedStates.join(',')}` });
    }

    const updateFields = {};
    if (nuevoEstado) updateFields.con_estado = nuevoEstado;
    if (prestamo_pagado !== undefined) updateFields.con_prestamo_pagado = prestamo_pagado ? 1 : 0;

    const updated = await contratosModel.updateContract(id, updateFields);
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });

    const contrato = await contratosModel.getContractById(id);

    // efecto: R -> a_venta
    if (nuevoEstado === 'R' && contrato && contrato.producto_id) {
      try {
        await axios.patch(`${PRODUCTOS_URL}/api/productos/${contrato.producto_id}/estado`, { estado: 'a_venta' }, { timeout: 7000 });
      } catch (err) {
        const payload = {
          contratoId: id,
          productoId: contrato.producto_id,
          action: 'set_a_venta',
          detail: err.response ? JSON.stringify(err.response.data) : (err.message || 'Error desconocido'),
          timestamp: new Date().toISOString(),
          attempts: 0
        };
        console.error('Error actualizando producto a a_venta. Registrando acción pendiente:', payload.detail);
        await logFailedProductActionToStorage(payload);
      }
    }

    // efecto: P -> borrar producto
    const shouldDeleteProduct = (prestamo_pagado === true) || (nuevoEstado === 'P') || contrato.con_prestamo_pagado == 1 || contrato.con_estado === 'P';
    if (shouldDeleteProduct && contrato && contrato.producto_id) {
      try {
        await axios.delete(`${PRODUCTOS_URL}/api/productos/${contrato.producto_id}`, {
          data: { con_numero: contrato.con_numero },
          timeout: 7000
        });
      } catch (err) {
        const payload = {
          contratoId: id,
          productoId: contrato.producto_id,
          action: 'delete_producto',
          detail: err.response ? JSON.stringify(err.response.data) : (err.message || 'Error desconocido'),
          timestamp: new Date().toISOString(),
          attempts: 0
        };
        console.error('Error borrando producto en Productos. Registrando acción pendiente:', payload.detail);
        await logFailedProductActionToStorage(payload);
      }
    }

    console.info(`Estado del contrato ${id} cambiado a ${nuevoEstado} por admin=${req.user ? req.user.id : 'unknown'}`);
    return res.json({ ok: true, msg: 'Estado actualizado correctamente', contratoId: id });

  } catch (err) {
    console.error('Error en PATCH /contratos/:id/estado', err.response ? err.response.data : err.message || err);
    return res.status(500).json({ ok: false, msg: 'Error al actualizar estado del contrato' });
  }
});

// ---------- RUTAS SEMÁNTICAS (indicators) ----------

// PATCH /:id/firmar -> marca con_firmado = 1  (autenticado)
router.patch('/:id/firmar', authenticateJWT, async (req, res) => {
  try {
    const updated = await contratosModel.updateContract(req.params.id, { con_firmado: 1 });
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });

    // opcional: almacenar quien firmó (req.user.id) en logs/tabla audit (recomendado)
    console.info(`Contrato ${req.params.id} firmado por user=${req.user ? req.user.id : 'unknown'}`);

    res.json({ ok: true, msg: 'Contrato marcado como firmado' });
  } catch (err) {
    console.error('Error en PATCH /contratos/:id/firmar', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error marcando contrato como firmado' });
  }
});

// PATCH /:id/entregar -> marca con_producto_entregado = 1 y con_entrega = 1 (autenticado)
router.patch('/:id/entregar', authenticateJWT, async (req, res) => {
  try {
    const updated = await contratosModel.updateContract(req.params.id, { con_producto_entregado: 1, con_entrega: 1 });
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });

    console.info(`Contrato ${req.params.id} marcado como entregado por user=${req.user ? req.user.id : 'unknown'}`);
    res.json({ ok: true, msg: 'Producto marcado como entregado' });
  } catch (err) {
    console.error('Error en PATCH /contratos/:id/entregar', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error marcando producto como entregado' });
  }
});

// PATCH /:id/desembolsar -> marca con_monto_entregado = 1 y guarda monto_desembolsado (autenticado)
router.patch('/:id/desembolsar', authenticateJWT, async (req, res) => {
  try {
    const { monto } = req.body;
    if (!isPositiveNumber(monto)) {
      return res.status(400).json({ ok: false, msg: 'Debes enviar monto positivo (monto desembolsado)' });
    }
    const updateFields = { con_monto_entregado: 1, monto_desembolsado: Number(monto) };
    const updated = await contratosModel.updateContract(req.params.id, updateFields);
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });

    console.info(`Contrato ${req.params.id} registrado desembolso=${monto} por user=${req.user ? req.user.id : 'unknown'}`);
    res.json({ ok: true, msg: 'Desembolso registrado correctamente' });
  } catch (err) {
    console.error('Error en PATCH /contratos/:id/desembolsar', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error registrando desembolso' });
  }
});

module.exports = router;
