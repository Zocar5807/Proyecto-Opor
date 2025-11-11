
// src/models/contratosModel.js
const pool = require('../db');

async function createContract(data) {
  const conn = await pool.getConnection();
  try {
    // La tabla contrato tiene: con_numero (PK), con_cliente, con_fecha, con_valor, con_estado,
    // con_fecha_plazo, con_tiempo, con_tasa, con_cedula, con_usuario, con_entrega, etc.
    // No tiene: solicitud_id, producto_id, con_firmado, con_producto_entregado, etc.
    // Necesitamos generar con_numero si no viene
    // con_numero es INTEGER, así que debe ser un número, no un string con prefijo
    let conNumero = data.con_numero;
    if (!conNumero) {
      const [maxResult] = await conn.query('SELECT MAX(con_numero) as max_num FROM contrato');
      conNumero = (maxResult[0]?.max_num || 100000) + 1;
    }
    // Asegurarnos de que conNumero sea un número entero
    // Si viene como string con prefijo "C-", extraer solo el número
    if (typeof conNumero === 'string' && conNumero.startsWith('C-')) {
      const numPart = conNumero.replace('C-', '');
      conNumero = parseInt(numPart, 10) || null;
    }
    // Convertir a número si es string numérico
    conNumero = Number(conNumero);
    if (isNaN(conNumero) || conNumero <= 0) {
      // Si no es válido, generar uno nuevo
      const [maxResult] = await conn.query('SELECT MAX(con_numero) as max_num FROM contrato');
      conNumero = (maxResult[0]?.max_num || 100000) + 1;
    }

    const sql = `
      INSERT INTO contrato
      (con_numero, con_cliente, con_fecha, con_valor, con_estado,
       con_fecha_plazo, con_tiempo, con_tasa, con_cedula, con_usuario, con_entrega)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      conNumero,
      data.con_cliente || null,
      data.con_fecha || new Date(),
      Math.round(Number(data.con_valor || 0)),
      data.con_estado || 'A',
      data.con_fecha_plazo || null,
      data.con_tiempo || 0,
      data.con_tasa || 0.0,
      data.con_cedula ? Number(data.con_cedula) : null, // Asegurar que sea número o null
      data.con_usuario || 999, // Usuario por defecto
      data.con_entrega || 0
    ];

    const [result] = await conn.execute(sql, params);
    return { insertId: conNumero }; // Retornamos con_numero como insertId
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
    // La tabla contrato usa con_numero como PK, no id
    const [rows] = await conn.execute('SELECT * FROM contrato WHERE con_numero = ?', [id]);
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
    // La tabla usa con_numero como PK, no id
    const sql = `UPDATE contrato SET ${sets.join(', ')} WHERE con_numero = ?`;
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
    // Nota: La tabla contrato no tiene campos con_producto_entregado ni con_firmado
    // Estos filtros se omiten por ahora
    // if (filters.not_entregado === true) {
    //   wheres.push('con_producto_entregado = 0');
    // }
    // if (filters.not_firmado === true) {
    //   wheres.push('con_firmado = 0');
    // }
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
