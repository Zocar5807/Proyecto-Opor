// /Solicitudes/src/models/solicitudesModel.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'base00',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT) || 10
});

/**
 * crearSolicitud(payload)
 * payload: { usuarioId, nombre, cedula, username, estado, fechaCreacion, categoria, nombreProducto, descripcion, imagenes: [] }
 * Guarda cliente_json y producto_json y rellenar imagen1..imagen3 si vienen como array.
 */
async function crearSolicitud(payload) {
  const cliente = {
    id: payload.usuarioId,
    nombre: payload.nombre,
    apellidos: payload.apellidos,
    cedula: payload.cedula,
    username: payload.username
  };
  const producto = {
    nombre: payload.nombreProducto,
    descripcion: payload.descripcion,
    categoria: payload.categoria,
    imagenes: payload.imagenes || []
  };

  // mapear imagenes a columnas imagen1..3 si vienen
  const imgs = Array.isArray(producto.imagenes) ? producto.imagenes.slice(0, 3) : [];
  const imagen1 = imgs[0] || null;
  const imagen2 = imgs[1] || null;
  const imagen3 = imgs[2] || null;

  const sql = `INSERT INTO solicitudes
    (usuario_id, cliente_json, producto_json, estado, nombre_producto, descripcion, categoria, imagen1, imagen2, imagen3, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

  const params = [
    cliente.id || null,
    JSON.stringify(cliente),
    JSON.stringify(producto),
    payload.estado || 'Pendiente',
    producto.nombre || null,
    producto.descripcion || null,
    producto.categoria || null,
    imagen1, imagen2, imagen3
  ];

  const [result] = await pool.query(sql, params);
  return { insertId: result.insertId };
}

/**
 * obtenerSolicitudes(filters)
 * filters: { estado, usuario_id, q, date_from, date_to, page, limit }
 * devuelve { rows, total, page, limit }
 */
async function obtenerSolicitudes(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.max(1, Math.min(500, Number(filters.limit) || 50));
  const offset = (page - 1) * limit;

  let sql = 'FROM solicitudes WHERE 1=1';
  const params = [];

  if (filters.estado) {
    sql += ' AND estado = ?';
    params.push(filters.estado);
  }
  if (filters.usuario_id) {
    sql += ' AND (usuario_id = ? OR JSON_EXTRACT(cliente_json, "$.id") = ?)';
    params.push(filters.usuario_id, filters.usuario_id);
  }
  if (filters.q) {
    sql += ' AND (nombre_producto LIKE ? OR descripcion LIKE ? OR JSON_EXTRACT(cliente_json, "$.nombre") LIKE ?)';
    const qlike = `%${filters.q}%`;
    params.push(qlike, qlike, qlike);
  }
  if (filters.date_from) {
    sql += ' AND created_at >= ?';
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    sql += ' AND created_at <= ?';
    params.push(filters.date_to);
  }

  // total
  const [countRows] = await pool.query(`SELECT COUNT(1) as total ${sql}`, params);
  const total = countRows && countRows[0] ? countRows[0].total : 0;

  // rows
  const [rows] = await pool.query(`SELECT id, usuario_id, nombre_producto, estado, created_at ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

  return { rows, total, page, limit };
}

/**
 * obtenerSolicitudesPorEstado(estado)
 */
async function obtenerSolicitudesPorEstado(estado) {
  const [rows] = await pool.query('SELECT id, usuario_id, nombre_producto, estado, created_at FROM solicitudes WHERE estado = ? ORDER BY created_at DESC LIMIT 500', [estado]);
  return rows;
}

/**
 * obtenerSolicitudPorId(id)
 * Devuelve registro completo, con cliente/producto parseados si existen.
 */
async function obtenerSolicitudPorId(id) {
  const [rows] = await pool.query('SELECT * FROM solicitudes WHERE id = ? LIMIT 1', [id]);
  if (!rows || rows.length === 0) return null;
  const r = rows[0];

  // intentar parsear cliente_json y producto_json si existen
  try { r.cliente = r.cliente_json ? JSON.parse(r.cliente_json) : null; } catch(e) { r.cliente = null; }
  try { r.producto = r.producto_json ? JSON.parse(r.producto_json) : null; } catch(e) { r.producto = null; }

  // normalizar imagenes: si producto.imagenes existe use eso; si no, usar columnas imagen1..3
  const imagenesFromCols = [r.imagen1, r.imagen2, r.imagen3].filter(Boolean);
  r.imagenes = (r.producto && Array.isArray(r.producto.imagenes) && r.producto.imagenes.length) ? r.producto.imagenes : imagenesFromCols;

  return r;
}

/**
 * actualizarEstado(id, nuevoEstado, adminId = null, motivo = null)
 * Guarda aprobado_por (adminId) y motivo_rechazo si aplica y fecha_respuesta
 * Usa una transacción para garantizar atomicidad.
 */
async function actualizarEstado(id, nuevoEstado, adminId = null, motivo = null) {
  let conn;  // Variable para la conexión dedicada
  try {
    // Obtener una conexión dedicada del pool para la transacción
    conn = await pool.getConnection();
    
    // Iniciar la transacción
    await conn.beginTransaction();
    console.log(`Transacción iniciada para solicitud ID: ${id}, nuevo estado: ${nuevoEstado}`);  // Logging para depuración

    // Construir la consulta UPDATE dentro de la transacción
    let sql = 'UPDATE solicitudes SET estado = ?, updated_at = NOW(), fecha_respuesta = NOW()';
    const params = [nuevoEstado];
    
    if (adminId) {
      sql += ', aprobado_por = ?';
      params.push(adminId);
    }
    if (motivo) {
      sql += ', motivo_rechazo = ?';
      params.push(motivo);
    }
    sql += ' WHERE id = ?';
    params.push(id);

    // Ejecutar la UPDATE dentro de la transacción
    const [result] = await conn.execute(sql, params);
    
    // Verificar si se afectó alguna fila (opcional, para validación extra)
    if (result.affectedRows === 0) {
      throw new Error(`No se encontró solicitud con ID: ${id}`);
    }
    
    // Si todo va bien, confirmar la transacción
    await conn.commit();
    console.log(`Transacción confirmada para solicitud ID: ${id}`);  // Logging exitoso
    
    return { affectedRows: result.affectedRows };
    
  } catch (error) {
    // Si hay error, revertir la transacción
    if (conn) {
      await conn.rollback();
      console.error(`Transacción revertida para solicitud ID: ${id} debido a error: ${error.message}`);
    }
    throw error;  // Re-lanzar para que el controller lo maneje
  } finally {
    // Siempre liberar la conexión de vuelta al pool
    if (conn) {
      conn.release();
    }
  }
}

module.exports = {
  crearSolicitud,
  obtenerSolicitudes,
  obtenerSolicitudesPorEstado,
  obtenerSolicitudPorId,
  actualizarEstado
};

