const pool = require('../db');

// Mapeo: API -> BD base20.articulos
// La tabla articulos tiene: art_consecutivo (PK), art_descripcion, art_valor, art_cantidad,
// art_peso, art_peso_piedra, art_clase, art_tipo, art_lugar, art_kilate, etc.

// Crear producto (artículo)
async function createProduct(data) {
  const conn = await pool.getConnection();
  try {
    // La tabla articulos no tiene auto-increment en art_consecutivo en algunos casos
    // Necesitamos obtener el siguiente consecutivo
    const [maxResult] = await conn.query('SELECT MAX(art_consecutivo) as max_cons FROM articulos');
    const siguienteConsecutivo = (maxResult[0]?.max_cons || 0) + 1;

    // Convertir lugar a número si es string (sucursal)
    let lugarNum = 1;
    if (data.lugar !== undefined && data.lugar !== null) {
      lugarNum = Number(data.lugar);
      if (isNaN(lugarNum)) lugarNum = 1; // Si no es número, usar default
    }

    const sql = `INSERT INTO articulos
      (art_consecutivo, art_descripcion, art_valor, art_cantidad, art_peso, art_peso_piedra,
       art_clase, art_tipo, art_lugar, art_kilate, art_orden, art_contrato)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      siguienteConsecutivo,
      data.nombre || data.descripcion || 'Producto sin descripción',
      Math.round(Number(data.precio || 0)),
      Number(data.cantidad || 1),
      data.peso ? Number(data.peso) : null,
      data.peso_piedra ? Number(data.peso_piedra) : null,
      data.clase || 1, // 1=Joyas, 2=Mercancía, 3=Vehículos
      data.tipo || 1,
      lugarNum,
      data.kilate || null,
      data.orden || 1,
      data.contrato_id || 0
    ];
    
    const [result] = await conn.execute(sql, params);
    return { insertId: siguienteConsecutivo };
  } catch (err) {
    console.error('Error en createProduct:', err);
    throw err; // Re-lanzar el error para que el controlador lo maneje
  } finally {
    conn.release();
  }
}

// Obtener productos (artículos)
async function getProducts(filters = {}) {
  const conn = await pool.getConnection();
  try {
    const wheres = [];
    const params = [];

    if (filters.categoria) {
      // art_clase podría mapear a categoría
      wheres.push('art_clase = ?');
      params.push(Number(filters.categoria));
    }
    if (filters.estado) {
      // No hay campo estado directo, podríamos usar art_sino
      wheres.push('art_sino = ?');
      params.push(filters.estado === 'garantia' ? 2 : 1);
    }
    if (filters.sucursal) {
      // art_lugar podría mapear a sucursal
      wheres.push('art_lugar = ?');
      params.push(Number(filters.sucursal));
    }
    if (filters.q) {
      wheres.push('art_descripcion LIKE ?');
      params.push(`%${filters.q}%`);
    }
    if (filters.sin_precio === 'true' || filters.sin_precio === '1') {
      wheres.push('art_valor = 0');
    }
    if (filters.precio_min) {
      wheres.push('art_valor >= ?');
      params.push(Number(filters.precio_min));
    }
    if (filters.precio_max) {
      wheres.push('art_valor <= ?');
      params.push(Number(filters.precio_max));
    }

    let sql = 'SELECT * FROM articulos';
    if (wheres.length > 0) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY art_consecutivo DESC';
    
    const [rows] = await conn.execute(sql, params);
    
    return rows.map(r => ({
      id: r.art_consecutivo,
      nombre: r.art_descripcion || 'Sin nombre',
      descripcion: r.art_descripcion || '',
      categoria: r.art_clase === 1 ? 'Joyas' : (r.art_clase === 2 ? 'Mercancía' : 'Vehículos'),
      precio: Number(r.art_valor || 0),
      cantidad: Number(r.art_cantidad || 0),
      estado: r.art_sino === 2 ? 'garantia' : 'a_venta',
      imagenes: [], // No hay campo de imágenes en articulos
      sucursal: String(r.art_lugar || ''),
      metadata: {
        peso: r.art_peso,
        peso_piedra: r.art_peso_piedra,
        kilate: r.art_kilate,
        tipo: r.art_tipo,
        contrato: r.art_contrato
      }
    }));
  } finally {
    conn.release();
  }
}

// Obtener producto por ID
async function getProductById(id) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT * FROM articulos WHERE art_consecutivo = ?', [id]);
    if (rows.length === 0) return null;
    
    const r = rows[0];
    return {
      id: r.art_consecutivo,
      nombre: r.art_descripcion || 'Sin nombre',
      descripcion: r.art_descripcion || '',
      categoria: r.art_clase === 1 ? 'Joyas' : (r.art_clase === 2 ? 'Mercancía' : 'Vehículos'),
      precio: Number(r.art_valor || 0),
      cantidad: Number(r.art_cantidad || 0),
      estado: r.art_sino === 2 ? 'garantia' : 'a_venta',
      imagenes: [],
      sucursal: String(r.art_lugar || ''),
      metadata: {
        peso: r.art_peso,
        peso_piedra: r.art_peso_piedra,
        kilate: r.art_kilate,
        tipo: r.art_tipo,
        contrato: r.art_contrato
      }
    };
  } finally {
    conn.release();
  }
}

// Actualizar producto
async function updateProduct(id, fields) {
  const conn = await pool.getConnection();
  try {
    const sets = [];
    const params = [];
    
    // Mapear campos API a campos BD
    if (fields.nombre !== undefined || fields.descripcion !== undefined) {
      sets.push('art_descripcion = ?');
      params.push(fields.nombre || fields.descripcion);
    }
    if (fields.precio !== undefined) {
      sets.push('art_valor = ?');
      params.push(Math.round(Number(fields.precio)));
    }
    if (fields.cantidad !== undefined) {
      sets.push('art_cantidad = ?');
      params.push(Number(fields.cantidad));
    }
    if (fields.estado !== undefined) {
      sets.push('art_sino = ?');
      params.push(fields.estado === 'garantia' ? 2 : 1);
    }
    if (fields.categoria !== undefined) {
      // Mapear categoría a art_clase
      const claseMap = { 'Joyas': 1, 'Mercancía': 2, 'Vehículos': 3 };
      sets.push('art_clase = ?');
      params.push(claseMap[fields.categoria] || 1);
    }
    if (fields.sucursal !== undefined) {
      sets.push('art_lugar = ?');
      params.push(Number(fields.sucursal));
    }
    if (fields.metadata) {
      if (fields.metadata.peso !== undefined) {
        sets.push('art_peso = ?');
        params.push(Number(fields.metadata.peso));
      }
      if (fields.metadata.peso_piedra !== undefined) {
        sets.push('art_peso_piedra = ?');
        params.push(Number(fields.metadata.peso_piedra));
      }
      if (fields.metadata.kilate !== undefined) {
        sets.push('art_kilate = ?');
        params.push(Number(fields.metadata.kilate));
      }
    }
    
    if (sets.length === 0) return { affectedRows: 0 };
    params.push(id);
    
    const sql = `UPDATE articulos SET ${sets.join(', ')} WHERE art_consecutivo = ?`;
    const [result] = await conn.execute(sql, params);
    return { affectedRows: result.affectedRows };
  } finally {
    conn.release();
  }
}

// Eliminar producto
async function deleteProduct(id) {
  const conn = await pool.getConnection();
  try {
    // En lugar de eliminar, podríamos marcar como eliminado o cambiar art_sino
    // Por ahora eliminamos físicamente
    const [result] = await conn.execute('DELETE FROM articulos WHERE art_consecutivo = ?', [id]);
    return { affectedRows: result.affectedRows };
  } finally {
    conn.release();
  }
}

// Obtener categorías disponibles
async function getCategorias() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT DISTINCT art_clase, 
        CASE art_clase
          WHEN 1 THEN 'Joyas'
          WHEN 2 THEN 'Mercancía'
          WHEN 3 THEN 'Vehículos'
          ELSE 'Otros'
        END AS nombre,
        COUNT(*) as cantidad
      FROM articulos
      WHERE art_clase IS NOT NULL
      GROUP BY art_clase
      ORDER BY art_clase
    `);
    return rows.map(r => ({
      id: r.art_clase,
      nombre: r.nombre,
      cantidad: r.cantidad
    }));
  } finally {
    conn.release();
  }
}

// Obtener sucursales disponibles
async function getSucursales() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT DISTINCT art_lugar as id,
        CONCAT('Sucursal ', art_lugar) as nombre,
        COUNT(*) as cantidad
      FROM articulos
      WHERE art_lugar IS NOT NULL AND art_lugar > 0
      GROUP BY art_lugar
      ORDER BY art_lugar
    `);
    return rows.map(r => ({
      id: String(r.id),
      nombre: r.nombre,
      cantidad: r.cantidad
    }));
  } finally {
    conn.release();
  }
}

// Función para asegurar que la tabla existe (no necesaria si ya existe)
async function ensureTable() {
  // La tabla ya existe en base20, no necesitamos crearla
  return true;
}

module.exports = {
  ensureTable,
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getCategorias,
  getSucursales
};
