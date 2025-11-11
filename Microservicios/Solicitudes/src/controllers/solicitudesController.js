require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const router = express.Router();

// punto al modelo correcto (no al propio controller)
const service = require('../models/solicitudesModel');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';
const CONTRACTS_URL = process.env.CONTRACTS_URL || null;

// --- Middleware ---
function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ ok: false, msg: 'No token provided' });

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ ok: false, msg: 'Invalid Authorization format. Use: Bearer <token>' });
  }
  const token = parts[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.token = token;   // <-- guardamos el token
    req.user = {
      id: payload.id,
      nombre: payload.nombre,
      apellidos: payload.apellidos,
      cedula: payload.cedula,
      username: payload.username,
      rol: payload.rol,
      raw: payload
    };
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, msg: 'Invalid or expired token', error: err.message });
  }
}

// Autenticación opcional: si hay token válido, rellena req.user; si no, sigue sin 401
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
      nombre: payload.nombre,
      apellidos: payload.apellidos,
      cedula: payload.cedula,
      username: payload.username,
      rol: payload.rol,
      raw: payload
    };
  } catch (e) {
    // ignorar tokens inválidos en modo opcional
  }
  return next();
}

function requireAdmin(req, res, next) {
  const rol = req.user && req.user.rol;
  if (!rol) return res.status(403).json({ ok: false, msg: 'No rol found in token' });
  const r = String(rol).toLowerCase();
  if (r !== 'admin' && r !== 'administrador') {
    return res.status(403).json({ ok: false, msg: 'Access denied: admin required' });
  }
  return next();
}

// helpers
function normalizeImagesFromBody(body) {
  if (!body) return [];
  if (Array.isArray(body.imagenes)) return body.imagenes.slice(0, 3);
  const imgs = [];
  if (body.imagen1) imgs.push(body.imagen1);
  if (body.imagen2) imgs.push(body.imagen2);
  if (body.imagen3) imgs.push(body.imagen3);
  return imgs.slice(0, 3);
}

// normalize field helpers (acepta snake_case y camelCase del modelo)
function getField(obj, ...keys) {
  for (const k of keys) {
    if (obj == null) continue;
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

// --- Routes ---
router.get('/ping', (req, res) => res.json({ ok: true, msg: 'Microservicio Solicitudes - OK' }));

// POST /api/solicitudes
router.post('/', authenticateJWT, async (req, res) => {
  console.log("BodyRecibido:", JSON.stringify(req.body, null, 2))
  console.log("BodyRecibido de usuario:", JSON.stringify(req.user, null, 2))

  try {
    const body = req.body || {};
    const user = req.user || {};

    const imagenes = normalizeImagesFromBody(body);

    const nuevaSolicitud = {
      // aceptamos tanto usuarioId como usuario_id en el body o del token
      usuarioId: user.id || body.usuarioId || body.usuario_id || 0,
      nombre: user.nombre || user.nombres || (user.raw && user.raw.nombres) || body.nombre || body.nombre_cliente || null,
      apellidos: user.apellidos || (user.raw && user.raw.apellidos) || body.apellidos || body.apellidos_cliente || null,
      cedula: user.cedula || (user.raw && user.raw.cedula) || body.cedula || body.identificacion || null,
      username: user.username || (user.raw && user.raw.username) || body.username || null,
      estado: body.estado || 'Pendiente',
      fechaCreacion: body.fechaCreacion || body.fecha_creacion || null,
      categoria: body.categoria || null,
      // aceptamos varios alias de nombre de producto
      nombreProducto: getField(body, 'nombre_producto', 'nombreProducto', 'nombre') || null,
      descripcion: getField(body, 'descripcion', 'desc') || null,
      imagenes
    };

    if (!nuevaSolicitud.nombre || !nuevaSolicitud.cedula || !nuevaSolicitud.username) {
      return res.status(400).json({
        ok: false,
        msg: 'Faltan datos del usuario (nombre/cedula/username). Asegura que el token incluya estos claims o pásalos en el body.'
      });
    }

    const created = await service.crearSolicitud(nuevaSolicitud);
    // devolver forma consistente
    return res.status(201).json({ ok: true, msg: 'Solicitud creada', data: created });
  } catch (err) {
    console.error('POST /api/solicitudes error:', err);
    return res.status(500).json({ ok: false, msg: 'Error creando solicitud', error: err.message });
  }
});

// GET /api/solicitudes  (filtros + paginación)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const filters = {
      estado: req.query.estado,
      usuario_id: req.query.usuario_id,
      q: req.query.q,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      page: req.query.page,
      limit: req.query.limit
    };

    // si ?mine=true, forzar filtro por usuario autenticado
    if (String(req.query.mine || '').toLowerCase() === 'true') {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ ok: false, msg: 'Token requerido para ver tus solicitudes' });
      }
      filters.usuario_id = req.user.id;
    }

    const result = await service.obtenerSolicitudes(filters);

    //  Normalizamos la respuesta para incluir datos de cliente
    const data = (result.rows || []).map(r => {
      let cliente = null;
      try {
        cliente = r.cliente_json ? JSON.parse(r.cliente_json) : null;
        console.log(`cliente_json para ID ${r.id}:`, r.cliente_json);  // Cambio: usa backticks para interpolación
      } catch (e) {
        console.error(`Error parseando cliente_json para solicitud ID ${r.id}:`, e.message);  // Cambio: usa backticks para interpolación
      }

      // Intentar parsear producto_json si existe
      let producto = null;
      try {
        producto = r.producto_json ? JSON.parse(r.producto_json) : null;
      } catch (e) {
        console.error(`Error parseando producto_json para solicitud ID ${r.id}:`, e.message);
      }
      
      return {
        id: r.id,
        usuario_id: r.usuario_id,
        nombre: cliente?.nombre || null,
        apellidos: cliente?.apellidos || null,
        cedula: cliente?.cedula || null,
        username: cliente?.username || null,
        estado: r.estado,
        fecha_creacion: r.created_at,
        fecha_respuesta: r.fecha_respuesta || null,
        categoria: r.categoria || producto?.categoria || null,
        nombre_producto: r.nombre_producto,
        descripcion: r.descripcion || null,
        monto_aprobado: r.monto_aprobado || null,
        producto: producto
      };
    });

    return res.json({
      ok: true,
      meta: { total: result.total, page: result.page, limit: result.limit },
      data
    });
  } catch (err) {
    console.error('GET /api/solicitudes error:', err);
    return res.status(500).json({ ok: false, msg: 'Error obteniendo solicitudes', error: err.message });
  }
});

router.get('/estado/:estado', async (req, res) => {
  try {
    const estado = req.params.estado;
    const rows = await service.obtenerSolicitudesPorEstado(estado);

    const data = rows.map(r => {
      let cliente = null;
      try { cliente = r.cliente_json ? JSON.parse(r.cliente_json) : null; } catch (e) { }
      console.log('cliente_json para ID ${r.id}:', r.cliente_json);
      return {
        id: r.id,
        usuario_id: r.usuario_id,
        nombre: cliente?.nombre || null,
        apellidos: cliente?.apellidos || null,
        cedula: cliente?.cedula || null,
        username: cliente?.username || null,
        estado: r.estado,
        fecha_creacion: r.created_at,
        categoria: r.categoria || null,
        nombre_producto: r.nombre_producto,
        descripcion: r.descripcion || null
      };
    });

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('GET /api/solicitudes/estado/:estado error:', err);
    return res.status(500).json({ ok: false, msg: 'Error obteniendo solicitudes por estado', error: err.message });
  }
});
// GET /api/solicitudes/:id
// Ahora requiere autenticación. Sólo admin o propietario puede ver.
router.get('/:id', authenticateJWT, async (req, res) => {
  console.log('Token recibido en GET /:id:', req.headers.authorization);
  try {
    const id = req.params.id;
    const solicitud = await service.obtenerSolicitudPorId(id);
    if (!solicitud) return res.status(404).json({ ok: false, msg: 'Solicitud no encontrada' });

    // --- Autorización: admin o propietario ---
    const user = req.user || {};
    const rol = String((user.rol || '').toLowerCase() || '');
    const isAdmin = (rol === 'admin' || rol === 'administrador');

    // soportamos tanto usuario_id (DB) como usuarioId
    const ownerId = getField(solicitud, 'usuario_id', 'usuarioId');
    const isOwner = user.id && String(user.id) === String(ownerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ ok: false, msg: 'Acceso denegado' });
    }

    // --- Normalizar imágenes ---
    const imagenesFromCols = [solicitud.imagen1, solicitud.imagen2, solicitud.imagen3].filter(Boolean);
    const imagenes = solicitud.imagenes && Array.isArray(solicitud.imagenes) && solicitud.imagenes.length
      ? solicitud.imagenes
      : imagenesFromCols;

    // --- Respuesta normalizada ---
    return res.json({
      ok: true,
      data: {
        id: getField(solicitud, 'id', 'ID'),
        usuario_id: ownerId,
        // Ahora tomamos los datos del cliente_json parseado
        nombre: solicitud.cliente?.nombre || null,
        apellidos: solicitud.cliente?.apellidos || null,
        cedula: solicitud.cliente?.cedula || null,
        username: solicitud.cliente?.username || null,
        estado: getField(solicitud, 'estado'),
        fecha_creacion: getField(solicitud, 'created_at', 'fecha_creacion', 'fechaCreacion'),
        fecha_respuesta: getField(solicitud, 'fecha_respuesta', 'fechaRespuesta'),
        categoria: getField(solicitud, 'categoria'),
        nombre_producto: getField(solicitud, 'nombre_producto', 'nombreProducto'),
        descripcion: getField(solicitud, 'descripcion'),
        imagenes,
        aprobado_por: getField(solicitud, 'aprobado_por') || null,
        motivo_rechazo: getField(solicitud, 'motivo_rechazo') || null,
        monto_aprobado: getField(solicitud, 'monto_aprobado') || null,
        tasa: getField(solicitud, 'tasa') || getField(solicitud, 'con_tasa') || null,
        plazo: getField(solicitud, 'plazo') || null,
        fecha_plazo: getField(solicitud, 'fecha_plazo') || null,
        sucursal: getField(solicitud, 'sucursal') || null
      }
    });
  } catch (err) {
    console.error('GET /api/solicitudes/:id error:', err);
    return res.status(500).json({ ok: false, msg: 'Error obteniendo solicitud', error: err.message });
  }
});


/**
 * PUT /api/solicitudes/:id/estado
 * Actualiza el estado. Requiere token admin.
 * Notifica a Contratos si el estado es 'Aprobado'.
 */
router.put('/:id/estado', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const nuevoEstado = req.body.estado;
    const motivo = req.body.motivo || null;
    const allowed = ['Pendiente', 'Aprobado', 'Rechazado'];

    // Validación básica del estado
    if (!nuevoEstado || !allowed.includes(nuevoEstado)) {
      return res.status(400).json({ ok: false, msg: `Estado inválido. Valores permitidos: ${allowed.join(', ')}` });
    }

    const adminId = req.user && req.user.id ? req.user.id : null;

    // Actualizar el estado en la base de datos con transacción
    const updated = await service.actualizarEstado(id, nuevoEstado, adminId, motivo);
    if (!updated || updated.affectedRows === 0) {
      return res.status(404).json({ ok: false, msg: 'Solicitud no encontrada' });
    }

    // Si se aprueba, actualizar también monto, tasa, plazo, etc.
    if (nuevoEstado === 'Aprobado' && (req.body.monto_aprobado || req.body.con_tasa || req.body.plazo || req.body.fecha_plazo || req.body.sucursal)) {
      try {
        await service.actualizarMontoAprobado(
          id,
          req.body.monto_aprobado,
          req.body.con_tasa,
          req.body.plazo,
          req.body.fecha_plazo,
          req.body.sucursal
        );
      } catch (err) {
        console.error('Error actualizando monto aprobado:', err);
        // No fallar la operación principal si esto falla
      }
    }

    // Si el estado es 'Aprobado', notificar a Contratos
    if (nuevoEstado === 'Aprobado' && CONTRACTS_URL) {
      try {
        // Obtener detalles de la solicitud actualizada
        const solicitud = await service.obtenerSolicitudPorId(id);
        if (!solicitud) {
          return res.json({
            ok: true,
            msg: 'Estado actualizado pero no se encontró la solicitud para notificar a Contratos',
            data: updated
          });
        }

        // Normalizar imágenes (flexible entre columnas e imagenes array)
        const imagenesFromCols = [solicitud.imagen1, solicitud.imagen2, solicitud.imagen3].filter(Boolean);
        const imagenes = solicitud.imagenes && Array.isArray(solicitud.imagenes) && solicitud.imagenes.length
          ? solicitud.imagenes
          : imagenesFromCols;

        // Construir el payload para Contratos usando snake_case y datos consistentes
        const payload = {
          solicitud_id: id, // Usar el ID de la solicitud como solicitud_id
          con_valor: req.body.monto_aprobado || 0, // Asegúrate de que el cliente envíe esto
          con_tasa: req.body.con_tasa || 0,
          con_tiempo: req.body.plazo || 30,
          con_fecha_plazo: req.body.fecha_plazo || null,
          con_sucursal: req.body.sucursal || "La44mal",
          cliente: {
            id: req.user.id,
            cedula: req.user.cedula,
            nombre: `${req.user.nombre || ''} ${req.user.apellidos || ''}`.trim() || req.user.name,
          },
          producto: {
            nombre: solicitud.nombre_producto || (solicitud.producto && solicitud.producto.nombre) || null,
            descripcion: solicitud.descripcion || (solicitud.producto && solicitud.producto.descripcion) || null,
            categoria: solicitud.categoria || (solicitud.producto && solicitud.producto.categoria) || null,
            imagenes: imagenes
          }
        };

        console.log('Payload enviado a Contratos:', JSON.stringify(payload, null, 2));

        // Usar el token original recibido en lugar de firmar uno nuevo
        const resp = await axios.post(
          `${CONTRACTS_URL.replace(/\/+$/, '')}/api/contratos`,
          payload,
          {
            headers: { Authorization: `Bearer ${req.token}` }, // Usa el token del request
            timeout: 7000
          }
        );

        return res.json({
          ok: true,
          msg: 'Estado actualizado y notificado a Contratos',
          data: updated,
          contratos: {
            success: true,
            status: resp.status,
            body: resp.data
          }
        });
      } catch (err) {
        console.error('Error notificando Contratos tras aprobación:', err.message || err);
        return res.json({
          ok: true,
          msg: 'Estado actualizado, pero fallo la notificación a Contratos',
          data: updated,
          contratos: {
            success: false,
            error: err.message || String(err)
          }
        });
        // Nota: La transacción en actualizarEstado ya protegió la BD; no necesitamos rollback aquí
        // Si quisieras revertir el estado, necesitarías otro UPDATE, pero esto complica el flujo
      }
    }

    return res.json({ ok: true, msg: 'Estado actualizado', data: updated });
  } catch (err) {
    console.error('PUT /api/solicitudes/:id/estado error:', err);
    return res.status(500).json({ ok: false, msg: 'Error actualizando estado', error: err.message });
  }
});



module.exports = router;

