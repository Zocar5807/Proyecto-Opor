const pool = require('../db');

async function ensureTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS productos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255),
      descripcion TEXT,
      categoria VARCHAR(100),
      precio DECIMAL(12,2) DEFAULT 0,
      cantidad INT DEFAULT 0,
      estado VARCHAR(30) DEFAULT 'garantia',
      imagenes JSON,
      sucursal VARCHAR(100),
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  const conn = await pool.getConnection();
  try {
    await conn.query(sql);
  } finally {
    conn.release();
  }
}

async function createProduct(data) {
  await ensureTable();
  const conn = await pool.getConnection();
  try {
    const sql = `INSERT INTO productos
      (nombre, descripcion, categoria, precio, cantidad, estado, imagenes, sucursal, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      data.nombre || null,
      data.descripcion || null,
      data.categoria || null,
      data.precio !== undefined ? Number(data.precio) : 0,
      data.cantidad !== undefined ? Number(data.cantidad) : 0,
      data.estado || 'garantia',
      data.imagenes ? JSON.stringify(data.imagenes) : null,
      data.sucursal || null,
      data.metadata ? JSON.stringify(data.metadata) : null
    ];
    const [result] = await conn.execute(sql, params);
    return { insertId: result.insertId };
  } finally {
    conn.release();
  }
}

async function getProducts(filters = {}) {
  await ensureTable();
  const conn = await pool.getConnection();
  try {
    const wheres = [];
    const params = [];

    if (filters.categoria) { wheres.push('categoria = ?'); params.push(filters.categoria); }
    if (filters.estado) { wheres.push('estado = ?'); params.push(filters.estado); }
    if (filters.sucursal) { wheres.push('sucursal = ?'); params.push(filters.sucursal); }
    if (filters.sin_precio === 'true' || filters.sin_precio === '1') { wheres.push('precio = 0'); }
    if (filters.q) { wheres.push('(nombre LIKE ? OR descripcion LIKE ?)'); params.push(`%${filters.q}%`, `%${filters.q}%`); }

    let sql = 'SELECT * FROM productos';
    if (wheres.length > 0) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const [rows] = await conn.execute(sql, params);
    return rows.map(r => ({
      ...r,
      imagenes: r.imagenes ? JSON.parse(r.imagenes) : [],
      metadata: r.metadata ? JSON.parse(r.metadata) : null
    }));
  } finally {
    conn.release();
  }
}

async function getProductById(id) {
  await ensureTable();
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT * FROM productos WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    r.imagenes = r.imagenes ? JSON.parse(r.imagenes) : [];
    r.metadata = r.metadata ? JSON.parse(r.metadata) : null;
    return r;
  } finally {
    conn.release();
  }
}

async function updateProduct(id, fields) {
  await ensureTable();
  const conn = await pool.getConnection();
  try {
    const sets = [];
    const params = [];
    for (const key of Object.keys(fields)) {
      if (key === 'imagenes' || key === 'metadata') {
        sets.push(`${key} = ?`);
        params.push(JSON.stringify(fields[key]));
      } else {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (sets.length === 0) return { affectedRows: 0 };
    params.push(id);
    const sql = `UPDATE productos SET ${sets.join(', ')} WHERE id = ?`;
    const [result] = await conn.execute(sql, params);
    return { affectedRows: result.affectedRows };
  } finally {
    conn.release();
  }
}

async function deleteProduct(id) {
  await ensureTable();
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute('DELETE FROM productos WHERE id = ?', [id]);
    return { affectedRows: result.affectedRows };
  } finally {
    conn.release();
  }
}

module.exports = {
  ensureTable,
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
};
