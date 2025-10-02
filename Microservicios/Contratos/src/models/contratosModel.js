
// src/models/contratosModel.js
const pool = require('../db');

async function createContract(data) {
  const conn = await pool.getConnection();
  try {
    const sql = `
      INSERT INTO contrato
      (solicitud_id, con_numero, con_cliente, con_fecha, con_valor, con_estado,
       con_fecha_plazo, con_tiempo, con_tasa, con_cedula,
       con_nombre_cliente, con_sucursal, producto_id,
       con_firmado, con_producto_entregado, con_monto_entregado, con_prestamo_pagado,
       producto_snapshot, monto_desembolsado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.solicitud_id || null,
      data.con_numero || null,
      data.con_cliente || null,
      data.con_fecha || new Date(),
      data.con_valor || 0,
      data.con_estado || 'A',
      data.con_fecha_plazo || null,
      data.con_tiempo || null,
      data.con_tasa || 1,
      data.con_cedula || null,
      data.con_nombre_cliente || null,
      data.con_sucursal || null,
      data.producto_id || null,
      data.con_firmado ? 1 : 0,
      data.con_producto_entregado ? 1 : 0,
      data.con_monto_entregado ? 1 : 0,
      data.con_prestamo_pagado ? 1 : 0,
      data.producto_snapshot ? JSON.stringify(data.producto_snapshot) : null,
      (data.monto_desembolsado !== undefined && data.monto_desembolsado !== null) ? Number(data.monto_desembolsado) : null
    ];

    const [result] = await conn.execute(sql, params);
    return { insertId: result.insertId };
  } finally {
    conn.release();
  }
}

async function getAllContracts() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM contrato ORDER BY con_fecha DESC');
    return rows;
  } finally {
    conn.release();
  }
}

async function getContractById(id) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT * FROM contrato WHERE id = ?', [id]);
    return rows[0] || null;
  } finally {
    conn.release();
  }
}

async function updateContract(id, fields) {
  const conn = await pool.getConnection();
  try {
    const sets = [];
    const params = [];
    for (const key of Object.keys(fields)) {
      if (key === 'producto_snapshot') {
        sets.push(`producto_snapshot = ?`);
        params.push(JSON.stringify(fields[key]));
      } else {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (sets.length === 0) return { affectedRows: 0 };
    params.push(id);
    const sql = `UPDATE contrato SET ${sets.join(', ')} WHERE id = ?`;
    const [result] = await conn.execute(sql, params);
    return { affectedRows: result.affectedRows };
  } finally {
    conn.release();
  }
}

async function updateContractState(id, newState, extraFields = {}) {
  const fields = { con_estado: newState, ...extraFields };
  return updateContract(id, fields);
}

async function getContractsByFilters(filters) {
  const conn = await pool.getConnection();
  try {
    const wheres = [];
    const params = [];

    if (filters.con_cliente) {
      wheres.push('con_cliente = ?');
      params.push(filters.con_cliente);
    }
    if (filters.con_cedula) {
      wheres.push('con_cedula = ?');
      params.push(filters.con_cedula);
    }
    if (filters.estado) {
      wheres.push('con_estado = ?');
      params.push(filters.estado);
    }
    if (filters.not_entregado === true) {
      wheres.push('con_producto_entregado = 0');
    }
    if (filters.not_firmado === true) {
      wheres.push('con_firmado = 0');
    }
    if (filters.fecha_vencimiento_from) {
      wheres.push('con_fecha_plazo >= ?');
      params.push(filters.fecha_vencimiento_from);
    }
    if (filters.fecha_vencimiento_to) {
      wheres.push('con_fecha_plazo <= ?');
      params.push(filters.fecha_vencimiento_to);
    }

    let sql = 'SELECT * FROM contrato';
    if (wheres.length > 0) {
      sql += ' WHERE ' + wheres.join(' AND ');
    }
    sql += ' ORDER BY con_fecha DESC';

    const [rows] = await conn.execute(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

module.exports = {
  createContract,
  getAllContracts,
  getContractById,
  updateContract,
  updateContractState,
  getContractsByFilters
};
