// src/models/liquidezModel.js
// Nota: Este modelo usa base11 (misma base que Solicitudes y Ordenes)
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: 'base11',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Obtener liquidez de todas las sucursales
async function obtenerLiquidezSucursales() {
  const conn = await pool.getConnection();
  try {
    // Verificar si la tabla existe, si no, retornar array vacío
    try {
      await conn.execute('SELECT 1 FROM liquidez_sucursales LIMIT 1');
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Tabla liquidez_sucursales no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql');
        return [];
      }
      throw err;
    }
    
    const [rows] = await conn.execute(
      'SELECT * FROM liquidez_sucursales ORDER BY sucursal'
    );
    return rows;
  } finally {
    conn.release();
  }
}

// Obtener liquidez de una sucursal específica
async function obtenerLiquidezSucursal(sucursal) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      'SELECT * FROM liquidez_sucursales WHERE sucursal = ?',
      [sucursal]
    );
    return rows[0] || null;
  } finally {
    conn.release();
  }
}

// Actualizar liquidez de una sucursal
async function actualizarLiquidez(sucursal, liquidezActual, liquidezMinima, liquidezMaxima) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const sql = `
      INSERT INTO liquidez_sucursales (sucursal, liquidez_actual, liquidez_minima, liquidez_maxima)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        liquidez_actual = VALUES(liquidez_actual),
        liquidez_minima = VALUES(liquidez_minima),
        liquidez_maxima = VALUES(liquidez_maxima),
        updated_at = NOW()
    `;
    const params = [
      sucursal,
      Number(liquidezActual || 0),
      Number(liquidezMinima || 0),
      Number(liquidezMaxima || 0)
    ];
    
    await conn.execute(sql, params);
    await conn.commit();
    return { success: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Transferir fondos entre sucursales
async function transferirFondos(origen, destino, monto, motivo, realizadoPor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Verificar liquidez de origen
    const [origenRow] = await conn.execute(
      'SELECT liquidez_actual FROM liquidez_sucursales WHERE sucursal = ? FOR UPDATE',
      [origen]
    );
    
    if (!origenRow || origenRow.length === 0) {
      throw new Error(`Sucursal origen "${origen}" no encontrada`);
    }
    
    const liquidezOrigen = Number(origenRow[0].liquidez_actual);
    if (liquidezOrigen < monto) {
      throw new Error(`Liquidez insuficiente en ${origen}. Disponible: $${liquidezOrigen.toLocaleString()}`);
    }
    
    // Actualizar liquidez de origen
    await conn.execute(
      'UPDATE liquidez_sucursales SET liquidez_actual = liquidez_actual - ? WHERE sucursal = ?',
      [monto, origen]
    );
    
    // Actualizar liquidez de destino
    await conn.execute(
      `INSERT INTO liquidez_sucursales (sucursal, liquidez_actual, liquidez_minima, liquidez_maxima)
       VALUES (?, ?, 0, 0)
       ON DUPLICATE KEY UPDATE liquidez_actual = liquidez_actual + ?`,
      [destino, monto, monto]
    );
    
    // Registrar transferencia
    await conn.execute(
      `INSERT INTO transferencias_sucursales
       (sucursal_origen, sucursal_destino, monto, motivo, realizado_por, estado)
       VALUES (?, ?, ?, ?, ?, 'completada')`,
      [origen, destino, monto, motivo || null, realizadoPor || null]
    );
    
    await conn.commit();
    return { success: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Obtener historial de transferencias
async function obtenerTransferencias(filters = {}) {
  const conn = await pool.getConnection();
  try {
    // Verificar si la tabla existe, si no, retornar array vacío
    try {
      await conn.execute('SELECT 1 FROM transferencias_sucursales LIMIT 1');
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Tabla transferencias_sucursales no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql');
        return [];
      }
      throw err;
    }
    
    let sql = 'SELECT * FROM transferencias_sucursales WHERE 1=1';
    const params = [];
    
    if (filters.sucursal_origen) {
      sql += ' AND sucursal_origen = ?';
      params.push(filters.sucursal_origen);
    }
    if (filters.sucursal_destino) {
      sql += ' AND sucursal_destino = ?';
      params.push(filters.sucursal_destino);
    }
    if (filters.fecha_from) {
      sql += ' AND fecha_transferencia >= ?';
      params.push(filters.fecha_from);
    }
    if (filters.fecha_to) {
      sql += ' AND fecha_transferencia <= ?';
      params.push(filters.fecha_to);
    }
    
    sql += ' ORDER BY fecha_transferencia DESC LIMIT 100';
    const [rows] = await conn.execute(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

module.exports = {
  obtenerLiquidezSucursales,
  obtenerLiquidezSucursal,
  actualizarLiquidez,
  transferirFondos,
  obtenerTransferencias
};









