// src/models/pagosModel.js
const pool = require('../db');

// Crear un pago
async function crearPago(pago) {
  const conn = await pool.getConnection();
  try {
    // Verificar si la tabla existe, si no, retornar error controlado
    try {
      await conn.execute('SELECT 1 FROM pagos_prestamos LIMIT 1');
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Tabla pagos_prestamos no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql');
        // Retornar un objeto con error en lugar de lanzar excepción para que el controlador pueda manejarlo
        return { error: 'Tabla pagos_prestamos no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql' };
      }
      throw err;
    }
    
    const sql = `
      INSERT INTO pagos_prestamos
      (contrato_id, solicitud_id, monto, metodo_pago, referencia, observaciones, fecha_pago)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      pago.contrato_id,
      pago.solicitud_id || null,
      Number(pago.monto),
      pago.metodo_pago || null,
      pago.referencia || null,
      pago.observaciones || null,
      pago.fecha_pago || new Date()
    ];
    const [result] = await conn.execute(sql, params);
    return { insertId: result.insertId };
  } finally {
    conn.release();
  }
}

// Obtener pagos de un contrato
async function obtenerPagosPorContrato(contratoId) {
  const conn = await pool.getConnection();
  try {
    // Verificar si la tabla existe, si no, retornar array vacío
    try {
      await conn.execute('SELECT 1 FROM pagos_prestamos LIMIT 1');
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Tabla pagos_prestamos no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql');
        return [];
      }
      throw err;
    }
    
    const [rows] = await conn.execute(
      'SELECT * FROM pagos_prestamos WHERE contrato_id = ? ORDER BY fecha_pago DESC',
      [contratoId]
    );
    return rows;
  } finally {
    conn.release();
  }
}

// Calcular saldo de un contrato (monto total - pagos realizados)
async function calcularSaldoContrato(contratoId, montoTotal) {
  const conn = await pool.getConnection();
  try {
    // Verificar si la tabla existe, si no, retornar saldo igual al monto total
    try {
      await conn.execute('SELECT 1 FROM pagos_prestamos LIMIT 1');
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Tabla pagos_prestamos no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql');
        return {
          montoTotal: Number(montoTotal),
          totalPagado: 0,
          saldo: Number(montoTotal)
        };
      }
      throw err;
    }
    
    const [rows] = await conn.execute(
      'SELECT COALESCE(SUM(monto), 0) as total_pagado FROM pagos_prestamos WHERE contrato_id = ?',
      [contratoId]
    );
    const totalPagado = Number(rows[0]?.total_pagado || 0);
    const saldo = Number(montoTotal) - totalPagado;
    return {
      montoTotal: Number(montoTotal),
      totalPagado,
      saldo: Math.max(0, saldo)
    };
  } finally {
    conn.release();
  }
}

// Obtener todos los pagos con filtros
async function obtenerPagos(filters = {}) {
  const conn = await pool.getConnection();
  try {
    // Verificar si la tabla existe, si no, retornar array vacío
    try {
      await conn.execute('SELECT 1 FROM pagos_prestamos LIMIT 1');
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Tabla pagos_prestamos no existe. Ejecuta la migración: db/migrations/20251107_add_prestamos_tables.sql');
        return [];
      }
      throw err;
    }
    
    let sql = 'SELECT * FROM pagos_prestamos WHERE 1=1';
    const params = [];
    
    if (filters.contrato_id) {
      sql += ' AND contrato_id = ?';
      params.push(filters.contrato_id);
    }
    if (filters.solicitud_id) {
      sql += ' AND solicitud_id = ?';
      params.push(filters.solicitud_id);
    }
    if (filters.fecha_from) {
      sql += ' AND fecha_pago >= ?';
      params.push(filters.fecha_from);
    }
    if (filters.fecha_to) {
      sql += ' AND fecha_pago <= ?';
      params.push(filters.fecha_to);
    }
    
    sql += ' ORDER BY fecha_pago DESC';
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(Number(filters.limit));
    }
    
    const [rows] = await conn.execute(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

module.exports = {
  crearPago,
  obtenerPagosPorContrato,
  calcularSaldoContrato,
  obtenerPagos
};









