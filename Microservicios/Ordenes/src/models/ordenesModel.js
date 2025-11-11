// models/ordenesModel.js
const pool = require('../db'); // conexión mysql2/promise

// Crear una orden en la DB
async function crearOrden(orden, conn) {
  try {
    const query = `
      INSERT INTO ordenes 
      (id_usuario, nombres_cliente, apellidos_cliente, cedula_cliente, email_cliente, telefono_cliente, 
       direccion_cliente, username_cliente, productos, total, fecha_creacion) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      orden.idUsuario,
      orden.nombresCliente,
      orden.apellidosCliente,
      orden.cedulaCliente,
      orden.emailCliente,
      orden.telefonoCliente,
      orden.direccionCliente,
      orden.usernameCliente,
      JSON.stringify(orden.productos),
      orden.totalCuenta,
      orden.fechaCreacion
    ];

    const [result] = await conn.query(query, values);

    // Retorna la orden recién creada con su nuevo ID
    return {
      idOrden: result.insertId,
      ...orden
    };
  } catch (err) {
    throw err;
  }
}

// Traer una orden por ID
async function traerOrden(id) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM ordenes WHERE id_orden = ?', [id]);
    if (rows.length === 0) return null;

    let productosParsed = [];
    if (rows[0].productos) {
      if (typeof rows[0].productos === 'string') {
        try {
          productosParsed = JSON.parse(rows[0].productos);
        } catch (err) {
          console.error('Error parseando productos (string):', err);
          productosParsed = [];
        }
      } else if (Array.isArray(rows[0].productos)) {
        productosParsed = rows[0].productos;
      } else if (typeof rows[0].productos === 'object') {
        productosParsed = [rows[0].productos];
      }
    }

    return { ...rows[0], productos: Array.isArray(productosParsed) ? productosParsed : [] };
  } finally {
    conn.release();
  }
}

// Traer todas las ordenes
async function traerOrdenes() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM ordenes ORDER BY fecha_creacion DESC');
    return rows.map(r => {
      let productosParsed = [];
      if (r.productos) {
        if (typeof r.productos === 'string') {
          try {
            productosParsed = JSON.parse(r.productos);
          } catch (err) {
            console.error('Error parseando productos (string):', err);
            productosParsed = [];
          }
        } else if (Array.isArray(r.productos)) {
          productosParsed = r.productos;
        } else if (typeof r.productos === 'object') {
          productosParsed = [r.productos];
        }
      }
      return { ...r, productos: Array.isArray(productosParsed) ? productosParsed : [] };
    });
  } finally {
    conn.release();
  }
}

// Traer órdenes por usuario
async function traerOrdenesPorUsuario(userId) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM ordenes WHERE id_usuario = ? ORDER BY fecha_creacion DESC', [userId]);
    return rows.map(r => {
      let productosParsed = [];
      if (r.productos) {
        if (typeof r.productos === 'string') {
          try {
            productosParsed = JSON.parse(r.productos);
          } catch (err) {
            console.error('Error parseando productos (string):', err);
            productosParsed = [];
          }
        } else if (Array.isArray(r.productos)) {
          productosParsed = r.productos;
        } else if (typeof r.productos === 'object') {
          productosParsed = [r.productos];
        }
      }
      return { ...r, productos: Array.isArray(productosParsed) ? productosParsed : [] };
    });
  } finally {
    conn.release();
  }
}

module.exports = {
  crearOrden,
  traerOrden,
  traerOrdenes,
  traerOrdenesPorUsuario
};
