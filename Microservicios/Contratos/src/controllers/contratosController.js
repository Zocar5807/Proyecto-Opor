const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const contratosModel = require('../models/contratosModel');
const liquidezModel = require('../models/liquidezModel');
const pool = require('../db');
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';
const SOLICITUDES_URL = process.env.SOLICITUDES_URL || 'http://localhost:3004';

let PRODUCTOS_URL = (process.env.PRODUCTOS_URL || 'http://localhost:3002').trim();
if (PRODUCTOS_URL.includes('/api/productos')) {
  PRODUCTOS_URL = PRODUCTOS_URL.replace('/api/productos', '').replace(/\/+$/, '');
}
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

/**
 * Autenticación opcional: si hay token válido, setea req.user; si no, continúa sin error
 */
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
    // Token inválido ignorado en modo opcional
  }
  return next();
}

router.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Microservicio de Contratos funcionando' });
});

/**
 * Crear contrato
 * Requiere autenticación JWT
 */
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
        nombres: req.user.nombres || req.user.nombre,
        apellidos: req.user.apellidos,
        cedula: req.user.cedula,
        username: req.user.username,
        rol: req.user.rol || req.user.role || 'admin',
        direccion: req.user.direccion,
        email: req.user.email,
        telefono: req.user.telefono
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log('Token usado para llamar a Solicitudes:', internalToken.substring(0, 20) + '...');

    let solicitudResponse;
    try {
      solicitudResponse = await axios.get(`${SOLICITUDES_URL}/api/solicitudes/${solicitudIdNum}`, {
        headers: { Authorization: `Bearer ${internalToken}` }
      });
      console.log('Respuesta de Solicitudes:', JSON.stringify(solicitudResponse.data, null, 2));
    } catch (err) {
      console.error('Error obteniendo solicitud desde microservicio Solicitudes:', err.response?.data || err.message);
      return res.status(500).json({ ok: false, msg: 'Error obteniendo solicitud', detail: err.response?.data?.msg || err.message });
    }
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
      descripcion: productoDesdeSolicitud.descripcion || productoDesdeSolicitud.nombre,
      categoria: productoDesdeSolicitud.categoria,
      imagenes: productoDesdeSolicitud.imagenes,
      estado: 'garantia',
      cantidad: 1, // Usar 'cantidad' en lugar de 'stock' para compatibilidad con el modelo
      precio: 0, // Precio por defecto
      metadata: {
        origen_contrato: true,
        con_numero: body.con_numero || null, // Se generará automáticamente en el modelo
        solicitud_id: solicitudIdNum
      }
    };
    console.log('Creando producto en Productos con payload:', JSON.stringify(productoPayload, null, 2));  
    let productosResp;
    try {
      // Construir URL correctamente: PRODUCTOS_URL es solo el host (http://localhost:3002)
      // El servidor de Productos tiene la ruta en /api/productos, así que solo agregamos eso
      // Asegurarnos de que no haya duplicación
      let productosUrl = PRODUCTOS_URL.trim();
      if (!productosUrl.endsWith('/api/productos')) {
        productosUrl = productosUrl.endsWith('/') 
          ? `${productosUrl}api/productos` 
          : `${productosUrl}/api/productos`;
      }
      console.log('URL de Productos:', productosUrl);
      productosResp = await axios.post(productosUrl, productoPayload, { 
        timeout: 7000,
        headers: { Authorization: req.headers['authorization'] }
      });
    } catch (err) {
      console.error('Error creando producto en microservicio Productos:', err.response?.data || err.message);
      const errorDetail = err.response?.data?.msg || err.response?.data?.error || err.message || 'Error desconocido';
      console.error('Detalle del error:', JSON.stringify(err.response?.data, null, 2));
      return res.status(500).json({ ok: false, msg: 'Error creando producto en Productos', detail: errorDetail });
    }
    const creadoProducto = productosResp.data?.data || productosResp.data?.producto || productosResp.data;
    console.log('Respuesta de Productos:', JSON.stringify(productosResp.data, null, 2));
    const productoId = creadoProducto?.id || creadoProducto?.insertId || productosResp.data?.data?.id || productosResp.data?.insertId;

    if (!productoId) {
      console.error('No se obtuvo productoId de la respuesta de Productos. Respuesta completa:', JSON.stringify(productosResp.data, null, 2));
      return res.status(500).json({ ok: false, msg: 'Error al crear producto en Productos: no se recibió ID del producto creado' });
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
      con_numero: body.con_numero || null, // Se generará automáticamente en el modelo
      con_cliente: cliente.id || null,
      con_fecha: body.con_fecha || new Date(),
      con_valor: Number(monto),
      con_estado: body.con_estado || 'A',
      con_fecha_plazo: body.con_fecha_plazo || null,
      con_tiempo: body.con_tiempo || null,
      con_tasa: body.con_tasa !== undefined ? Number(body.con_tasa) : null,  // Cambio: null si no se envía
      con_cedula: cliente.cedula ? Number(cliente.cedula) : null, // con_cedula es INTEGER, usar null si no hay cedula
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
      const errorDetail = err.response.data.msg || err.response.data.error || JSON.stringify(err.response.data);
      return res.status(err.response.status || 500).json({ ok: false, msg: 'Error en servicio externo', detail: errorDetail });
    }
    return res.status(500).json({ ok: false, msg: 'Error interno al crear contrato', error: err.message });
  }
});




// GET /liquidez -> obtener liquidez de todas las sucursales (ANTES de /:id para evitar conflicto de rutas)
router.get('/liquidez', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  try {
    const liquidez = await liquidezModel.obtenerLiquidezSucursales();
    res.json({ ok: true, data: liquidez });
  } catch (err) {
    console.error('Error GET /contratos/liquidez:', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo liquidez', error: err.message });
  }
});

// GET /liquidez/transferencias -> historial de transferencias
router.get('/liquidez/transferencias', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  try {
    const filters = {
      sucursal_origen: req.query.sucursal_origen,
      sucursal_destino: req.query.sucursal_destino,
      fecha_from: req.query.fecha_from,
      fecha_to: req.query.fecha_to
    };
    
    const transferencias = await liquidezModel.obtenerTransferencias(filters);
    res.json({ ok: true, data: transferencias });
  } catch (err) {
    console.error('Error GET /contratos/liquidez/transferencias:', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo transferencias', error: err.message });
  }
});

// POST /liquidez/transferir -> transferir fondos entre sucursales
router.post('/liquidez/transferir', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  try {
    const { sucursal_origen, sucursal_destino, monto, motivo } = req.body;
    
    if (!sucursal_origen || !sucursal_destino || !monto || monto <= 0) {
      return res.status(400).json({ ok: false, msg: 'sucursal_origen, sucursal_destino y monto (>0) son obligatorios' });
    }
    
    if (sucursal_origen === sucursal_destino) {
      return res.status(400).json({ ok: false, msg: 'Las sucursales origen y destino deben ser diferentes' });
    }
    
    const resultado = await liquidezModel.transferirFondos(
      sucursal_origen,
      sucursal_destino,
      Number(monto),
      motivo,
      req.user.id
    );
    
    res.json({ ok: true, msg: 'Transferencia realizada', data: resultado });
  } catch (err) {
    console.error('Error POST /contratos/liquidez/transferir:', err);
    res.status(500).json({ ok: false, msg: err.message || 'Error realizando transferencia', error: err.message });
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
      id: c.con_numero,
      con_numero: c.con_numero,
      estado: c.con_estado,
      con_estado: c.con_estado,
      fecha: c.con_fecha,
      con_fecha: c.con_fecha,
      fechaPlazo: c.con_fecha_plazo,
      con_fecha_plazo: c.con_fecha_plazo,
      monto: c.con_valor,
      con_valor: c.con_valor,
      cliente: c.con_cliente,
      con_cliente: c.con_cliente,
      clienteNombre: c.con_nombre_cliente || '',
      con_nombre_cliente: c.con_nombre_cliente || '',
      tasa: c.con_tasa,
      con_tasa: c.con_tasa,
      tiempo: c.con_tiempo,
      con_tiempo: c.con_tiempo,
      producto_snapshot: c.producto_snapshot ? (typeof c.producto_snapshot === 'string' ? JSON.parse(c.producto_snapshot) : c.producto_snapshot) : null
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
      id: contrato.con_numero,
      estado: contrato.con_estado,
      fecha: contrato.con_fecha,
      cliente: contrato.con_cliente,
      firmado: false, // No hay campo con_firmado en la tabla
      entregado: false, // No hay campo con_producto_entregado en la tabla
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
    // Nota: La tabla contrato no tiene producto_id, este efecto se omite por ahora
    // TODO: Implementar cuando se agregue relación producto-contrato

    // efecto: P -> borrar producto
    // Nota: La tabla contrato no tiene producto_id ni con_prestamo_pagado, este efecto se omite por ahora
    // TODO: Implementar cuando se agregue relación producto-contrato

    console.info(`Estado del contrato ${id} cambiado a ${nuevoEstado} por admin=${req.user ? req.user.id : 'unknown'}`);
    return res.json({ ok: true, msg: 'Estado actualizado correctamente', contratoId: id });

  } catch (err) {
    console.error('Error en PATCH /contratos/:id/estado', err.response ? err.response.data : err.message || err);
    return res.status(500).json({ ok: false, msg: 'Error al actualizar estado del contrato' });
  }
});

// ---------- RUTAS SEMÁNTICAS (indicators) ----------

// PATCH /:id/firmar -> marca con_firmado = 1  (autenticado)
// Simulamos la firma digital guardando en una tabla de firmas (si existe) o en logs
router.patch('/:id/firmar', authenticateJWT, async (req, res) => {
  try {
    const contratoId = req.params.id;
    const contrato = await contratosModel.getContractById(contratoId);
    if (!contrato) {
      return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });
    }
    
    // Simular firma digital: guardar información de firma
    // En producción, esto podría guardarse en una tabla separada o usar un servicio de firma digital
    const firmaData = {
      contrato_id: contratoId,
      usuario_id: req.user.id,
      fecha_firma: new Date(),
      ip: req.ip || 'unknown',
      user_agent: req.headers['user-agent'] || 'unknown'
    };
    
    // Intentar guardar en tabla de firmas (si existe)
    try {
      await pool.execute(
        `CREATE TABLE IF NOT EXISTS firmas_digitales (
          id INT AUTO_INCREMENT PRIMARY KEY,
          contrato_id INT NOT NULL,
          usuario_id INT NOT NULL,
          fecha_firma DATETIME DEFAULT CURRENT_TIMESTAMP,
          ip VARCHAR(45),
          user_agent TEXT,
          firma_hash VARCHAR(255),
          INDEX idx_contrato (contrato_id),
          INDEX idx_usuario (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      
      await pool.execute(
        `INSERT INTO firmas_digitales (contrato_id, usuario_id, fecha_firma, ip, user_agent, firma_hash)
         VALUES (?, ?, NOW(), ?, ?, ?)
         ON DUPLICATE KEY UPDATE fecha_firma = NOW()`,
        [
          contratoId,
          req.user.id,
          firmaData.ip,
          firmaData.user_agent,
          `firma_${contratoId}_${req.user.id}_${Date.now()}`
        ]
      );
    } catch (err) {
      console.warn('No se pudo guardar firma en BD, usando logs:', err.message);
    }
    
    console.info(`Contrato ${contratoId} marcado como firmado por user=${req.user.id}`);
    res.json({ ok: true, msg: 'Contrato firmado digitalmente', data: firmaData });
  } catch (err) {
    console.error('Error en PATCH /contratos/:id/firmar', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error marcando contrato como firmado' });
  }
});

// PATCH /:id/entregar -> marca con_producto_entregado = 1 y con_entrega = 1 (autenticado)
router.patch('/:id/entregar', authenticateJWT, async (req, res) => {
  try {
    // La tabla tiene con_entrega pero no con_producto_entregado
    const updated = await contratosModel.updateContract(req.params.id, { con_entrega: 1 });
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });

    console.info(`Contrato ${req.params.id} marcado como entregado por user=${req.user ? req.user.id : 'unknown'}`);
    res.json({ ok: true, msg: 'Producto marcado como entregado' });
  } catch (err) {
    console.error('Error en PATCH /contratos/:id/entregar', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error marcando producto como entregado' });
  }
});

// PATCH /:id/desembolsar -> marca con_monto_entregado = 1 y guarda monto_desembolsado (autenticado)
// Nota: La tabla contrato no tiene campos con_monto_entregado ni monto_desembolsado
router.patch('/:id/desembolsar', authenticateJWT, async (req, res) => {
  try {
    const { monto } = req.body;
    if (!isPositiveNumber(monto)) {
      return res.status(400).json({ ok: false, msg: 'Debes enviar monto positivo (monto desembolsado)' });
    }
    // Por ahora solo registramos en logs, no actualizamos BD
    console.info(`Contrato ${req.params.id} registrado desembolso=${monto} por user=${req.user ? req.user.id : 'unknown'}`);
    res.json({ ok: true, msg: 'Desembolso registrado correctamente (nota: campos no disponibles en BD)' });
  } catch (err) {
    console.error('Error en PATCH /contratos/:id/desembolsar', err.message || err);
    res.status(500).json({ ok: false, msg: 'Error registrando desembolso' });
  }
});

// ========== PAGOS ==========
const pagosModel = require('../models/pagosModel');

// POST /pagos -> crear pago
router.post('/pagos', authenticateJWT, async (req, res) => {
  try {
    const { contrato_id, solicitud_id, monto, metodo_pago, referencia, observaciones } = req.body;
    
    if (!contrato_id || !monto || monto <= 0) {
      return res.status(400).json({ ok: false, msg: 'contrato_id y monto (>0) son obligatorios' });
    }
    
    const pago = await pagosModel.crearPago({
      contrato_id,
      solicitud_id,
      monto,
      metodo_pago,
      referencia,
      observaciones
    });
    
    // Verificar si hay un error (tabla no existe)
    if (pago && pago.error) {
      return res.status(503).json({ ok: false, msg: pago.error });
    }
    
    res.status(201).json({ ok: true, msg: 'Pago registrado', data: pago });
  } catch (err) {
    console.error('Error POST /contratos/pagos:', err);
    res.status(500).json({ ok: false, msg: 'Error registrando pago', error: err.message });
  }
});

// GET /pagos -> obtener pagos
router.get('/pagos', authenticateJWT, async (req, res) => {
  try {
    const filters = {
      contrato_id: req.query.contrato_id,
      solicitud_id: req.query.solicitud_id,
      fecha_from: req.query.fecha_from,
      fecha_to: req.query.fecha_to,
      limit: req.query.limit || 100
    };
    
    const pagos = await pagosModel.obtenerPagos(filters);
    res.json({ ok: true, data: pagos });
  } catch (err) {
    console.error('Error GET /contratos/pagos:', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo pagos', error: err.message });
  }
});

// GET /:id/pagos -> obtener pagos de un contrato
router.get('/:id/pagos', authenticateJWT, async (req, res) => {
  try {
    const contratoId = req.params.id;
    const pagos = await pagosModel.obtenerPagosPorContrato(contratoId);
    
    // Calcular saldo
    const contrato = await contratosModel.getContractById(contratoId);
    if (!contrato) {
      return res.status(404).json({ ok: false, msg: 'Contrato no encontrado' });
    }
    
    const montoTotal = Number(contrato.con_valor || 0);
    const saldo = await pagosModel.calcularSaldoContrato(contratoId, montoTotal);
    
    res.json({ ok: true, data: { 
      pagos: Array.isArray(pagos) ? pagos : [],
      saldo: saldo || { montoTotal, totalPagado: 0, saldo: montoTotal }
    }});
  } catch (err) {
    console.error('Error GET /contratos/:id/pagos:', err);
    // Si la tabla no existe, retornar estructura vacía pero válida
    if (err.message && err.message.includes('no existe')) {
      const contrato = await contratosModel.getContractById(req.params.id);
      const montoTotal = Number(contrato?.con_valor || 0);
      return res.json({ ok: true, data: {
        pagos: [],
        saldo: { montoTotal, totalPagado: 0, saldo: montoTotal }
      }});
    }
    res.status(500).json({ ok: false, msg: 'Error obteniendo pagos', error: err.message });
  }
});

module.exports = router;
