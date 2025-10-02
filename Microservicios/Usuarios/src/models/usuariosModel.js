const pool = require('../db');
const bcrypt = require('bcrypt');

// Crear usuario
async function crearUsuario(usuario) {
  const query = `
    INSERT INTO usuarios 
      (cedula, nombres, apellidos, username, password, telefono, email, direccion, rol, estado, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  const values = [
    usuario.cedula,
    usuario.nombres,
    usuario.apellidos,
    usuario.username,
    usuario.password,
    usuario.telefono,
    usuario.email,
    usuario.direccion,
    usuario.rol,
    usuario.estado
  ];

  // Ejecutar insert
  const [result] = await pool.query(query, values);

  // Recuperar el nuevo usuario con SELECT
  const [rows] = await pool.query(
    `SELECT usu_codigo, cedula, nombres, apellidos, username, telefono, email, direccion, rol, estado
     FROM usuarios
     WHERE usu_codigo = ?`,
    [result.insertId]
  );

  return rows[0];
}
// Traer todos
async function traerUsuarios() {
  const [rows] = await pool.query(`
    SELECT usu_codigo, cedula, nombres, apellidos, username, password, telefono, email, direccion, rol, estado
    FROM usuarios
    WHERE deleted_at IS NULL
    ORDER BY usu_codigo ASC
  `);
  return rows; 
  }
// Traer por ID
async function traerUsuarioPorId(id) {
  const [rows] = await pool.query(`
    SELECT usu_codigo, cedula, nombres, apellidos, username, telefono, email, direccion, rol, estado
    FROM usuarios
    WHERE usu_codigo = ? AND deleted_at IS NULL
    LIMIT 1
  `, [id]);
  return rows[0];
}


async function traerUsuarioPorCedula(cedula) {
  const [rows] = await pool.query(`
    SELECT usu_codigo, cedula, nombres, apellidos, username, telefono, email, direccion, rol, estado
    FROM usuarios
    WHERE cedula = ? AND deleted_at IS NULL
    LIMIT 1
  `, [cedula]);
  return rows[0];
}


// Validar login
async function validarUsuario(username, password) {
  const [rows] = await pool.query(
    `SELECT * FROM usuarios
     WHERE username = ? AND estado = 'activo' AND deleted_at IS NULL
     LIMIT 1`,
    [username]
  );

  if (rows.length === 0) return null;

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) return null;

  return user;

}

// Actualizar usuario (MySQL/MariaDB)
async function actualizarUsuario(id, datos) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(datos)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  // Agregamos la fecha de actualización
  fields.push(`updated_at = NOW()`);

  values.push(id); // último valor es el id para el WHERE

  const sql = `
    UPDATE usuarios
    SET ${fields.join(', ')}
    WHERE usu_codigo = ? AND deleted_at IS NULL
  `;

  const [result] = await pool.query(sql, values);

  if (result.affectedRows === 0) {
    return null; // usuario no encontrado
  }

  // 🔎 Luego de actualizar, traemos el usuario actualizado
  const [rows] = await pool.query(
    `SELECT usu_codigo, cedula, nombres, apellidos, username, telefono, email, direccion, rol, estado 
     FROM usuarios 
     WHERE usu_codigo = ? AND deleted_at IS NULL`,
    [id]
  );

  return rows[0] || null;
}


// Eliminar usuario (soft delete)
// usuariosModel.js
async function eliminarUsuario(id) {
  const sql = `
    UPDATE usuarios
    SET estado = 'inactivo', deleted_at = NOW()
    WHERE usu_codigo = ?
  `;
  const [result] = await pool.query(sql, [id]);
  return { affectedRows: result.affectedRows };
}


module.exports = {
  crearUsuario,
  traerUsuarios,
  traerUsuarioPorId,
  validarUsuario,
  actualizarUsuario,
  eliminarUsuario,
  traerUsuarioPorCedula
};
