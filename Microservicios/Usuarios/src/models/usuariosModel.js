const pool = require('../db');
const bcrypt = require('bcrypt');

const NIVEL_POR_ROL = {
  admin: 5,
  empleado: 4,
  cliente: 3
};

const BASE_SELECT = `
  SELECT u.usu_codigo, u.usu_cedula, u.usu_clave, u.usu_estado, u.usu_nivel,
         u.usu_apellido1, u.usu_apellido2, u.usu_nombre1, u.usu_nombre2,
         u.usu_direccion, u.usu_telefono1, u.usu_telefono2, u.usu_ciudad, u.usu_abreviado,
         d.email         AS detalle_email,
         d.preferencias  AS detalle_preferencias
  FROM usuarios u
  LEFT JOIN usuarios_detalle d ON d.usuario_id = u.usu_codigo
`;

function rolDesdeNivel(nivel) {
  const key = Number(nivel);
  switch (key) {
    case 5:
      return 'admin';
    case 4:
      return 'empleado';
    default:
      return 'cliente';
  }
}

function nivelDesdeRol(rol = 'cliente') {
  const normalizado = String(rol || 'cliente').toLowerCase();
  return NIVEL_POR_ROL[normalizado] || NIVEL_POR_ROL.cliente;
}

function parsePreferencias(value) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  try {
    const parsed = JSON.parse(value.toString());
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

async function obtenerDetalleActual(conn, usuarioId) {
  const [rows] = await conn.query('SELECT email, preferencias FROM usuarios_detalle WHERE usuario_id = ?', [usuarioId]);
  if (rows.length === 0) return { email: null, preferencias: null };
  return {
    email: rows[0].email || null,
    preferencias: rows[0].preferencias ? parsePreferencias(rows[0].preferencias) : null
  };
}

async function upsertDetalle(conn, usuarioId, { email, preferencias } = {}) {
  if (email === undefined && preferencias === undefined) return;

  const actual = await obtenerDetalleActual(conn, usuarioId);

  const emailFinal = email === undefined ? actual.email : (email || null);
  let preferenciasFinal;
  if (preferencias === undefined) {
    preferenciasFinal = actual.preferencias;
  } else if (preferencias === null) {
    preferenciasFinal = null;
  } else {
    preferenciasFinal = preferencias;
  }

  const preferenciasSerializadas = preferenciasFinal === null || preferenciasFinal === undefined
    ? null
    : JSON.stringify(preferenciasFinal);

  await conn.query(
    `INSERT INTO usuarios_detalle (usuario_id, email, preferencias)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), preferencias = VALUES(preferencias)`,
    [usuarioId, emailFinal, preferenciasSerializadas]
  );
}

function transformarUsuario(row) {
  const nombres = `${row.usu_nombre1 || ''} ${row.usu_nombre2 || ''}`.trim();
  const apellidos = `${row.usu_apellido1 || ''} ${row.usu_apellido2 || ''}`.trim();
  const preferencias = parsePreferencias(row.detalle_preferencias);

  return {
    usu_codigo: row.usu_codigo,
    cedula: row.usu_cedula,
    nombres,
    apellidos,
    username: row.usu_abreviado || `user_${row.usu_codigo}`,
    telefono: row.usu_telefono1 || '',
    direccion: row.usu_direccion || '',
    ciudad: row.usu_ciudad || '',
    email: row.detalle_email || '',
    rol: rolDesdeNivel(row.usu_nivel),
    estado: row.usu_estado === 1 ? 'activo' : 'inactivo',
    preferencias
  };
}

async function crearUsuario(usuario) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[{ max_cod } = {}]] = await conn.query('SELECT MAX(usu_codigo) as max_cod FROM usuarios FOR UPDATE');
    const nuevoCodigo = (max_cod || 0) + 1;

    const nombres = (usuario.nombres || '').trim().split(/\s+/).filter(Boolean);
    const apellidos = (usuario.apellidos || '').trim().split(/\s+/).filter(Boolean);

    let passwordHash = usuario.password || usuario.usu_clave;
    if (passwordHash && !passwordHash.startsWith('$2')) {
      passwordHash = await bcrypt.hash(passwordHash, 10);
    }

    const insertUsuarioSQL = `
      INSERT INTO usuarios
        (usu_codigo, usu_cedula, usu_abreviado, usu_clave, usu_estado, usu_nivel,
         usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
         usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_fecha_ingreso)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
      nuevoCodigo,
      usuario.cedula || usuario.usu_cedula,
      usuario.username || `user_${nuevoCodigo}`,
      passwordHash,
      usuario.estado === 'inactivo' ? 2 : 1,
      nivelDesdeRol(usuario.rol),
      apellidos[0] || '',
      apellidos[1] || '',
      nombres[0] || '',
      nombres[1] || '',
      usuario.direccion || '',
      usuario.telefono || '',
      '',
      usuario.ciudad || 'CALI'
    ];

    await conn.query(insertUsuarioSQL, values);

    await upsertDetalle(conn, nuevoCodigo, {
      email: usuario.email || null,
      preferencias: usuario.preferencias || {}
    });

    await conn.commit();

    return await traerUsuarioPorId(nuevoCodigo);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function traerUsuarios() {
  try {
    const [rows] = await pool.query(`${BASE_SELECT}
      WHERE u.usu_estado IN (1, 2)
      ORDER BY u.usu_codigo ASC
    `);
    return rows.map(transformarUsuario);
  } catch (err) {
    // Si la tabla usuarios_detalle no existe, usar consulta sin JOIN
    if (err.code === 'ER_NO_SUCH_TABLE' || err.message.includes('usuarios_detalle')) {
      const [rows] = await pool.query(`
        SELECT usu_codigo, usu_cedula, usu_clave, usu_estado, usu_nivel,
               usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
               usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_abreviado,
               NULL AS detalle_email, NULL AS detalle_preferencias
        FROM usuarios
        WHERE usu_estado IN (1, 2)
        ORDER BY usu_codigo ASC
      `);
      return rows.map(transformarUsuario);
    }
    throw err;
  }
}

async function traerUsuarioPorId(id) {
  try {
    const [rows] = await pool.query(`${BASE_SELECT}
      WHERE u.usu_codigo = ? AND u.usu_estado IN (1, 2)
      LIMIT 1
    `, [id]);
    if (rows.length === 0) return null;
    return transformarUsuario(rows[0]);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.message.includes('usuarios_detalle')) {
      const [rows] = await pool.query(`
        SELECT usu_codigo, usu_cedula, usu_clave, usu_estado, usu_nivel,
               usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
               usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_abreviado,
               NULL AS detalle_email, NULL AS detalle_preferencias
        FROM usuarios
        WHERE usu_codigo = ? AND usu_estado IN (1, 2)
        LIMIT 1
      `, [id]);
      if (rows.length === 0) return null;
      return transformarUsuario(rows[0]);
    }
    throw err;
  }
}

async function traerUsuarioPorCedula(cedula) {
  try {
    const [rows] = await pool.query(`${BASE_SELECT}
      WHERE u.usu_cedula = ? AND u.usu_estado IN (1, 2)
      LIMIT 1
    `, [cedula]);
    if (rows.length === 0) return null;
    return transformarUsuario(rows[0]);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.message.includes('usuarios_detalle')) {
      const [rows] = await pool.query(`
        SELECT usu_codigo, usu_cedula, usu_clave, usu_estado, usu_nivel,
               usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
               usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_abreviado,
               NULL AS detalle_email, NULL AS detalle_preferencias
        FROM usuarios
        WHERE usu_cedula = ? AND usu_estado IN (1, 2)
        LIMIT 1
      `, [cedula]);
      if (rows.length === 0) return null;
      return transformarUsuario(rows[0]);
    }
    throw err;
  }
}

async function validarUsuario(username, password) {
  try {
    const [rows] = await pool.query(`${BASE_SELECT}
      WHERE (u.usu_abreviado = ? OR u.usu_cedula = ?)
        AND u.usu_estado = 1
      LIMIT 1
    `, [username, username]);

    if (rows.length === 0) return null;

    const row = rows[0];

    let match = false;
    if (row.usu_clave && row.usu_clave.startsWith('$2')) {
      try {
        match = await bcrypt.compare(password, row.usu_clave);
      } catch (err) {
        console.error('Error comparando bcrypt:', err);
        match = false;
      }
    } else {
      match = row.usu_clave === password;
    }

    if (!match) return null;

    return transformarUsuario(row);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.message.includes('usuarios_detalle')) {
      const [rows] = await pool.query(`
        SELECT usu_codigo, usu_cedula, usu_clave, usu_estado, usu_nivel,
               usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
               usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_abreviado,
               NULL AS detalle_email, NULL AS detalle_preferencias
        FROM usuarios
        WHERE (usu_abreviado = ? OR usu_cedula = ?)
          AND usu_estado = 1
        LIMIT 1
      `, [username, username]);

      if (rows.length === 0) return null;

      const row = rows[0];

      let match = false;
      if (row.usu_clave && row.usu_clave.startsWith('$2')) {
        try {
          match = await bcrypt.compare(password, row.usu_clave);
        } catch (err) {
          console.error('Error comparando bcrypt:', err);
          match = false;
        }
      } else {
        match = row.usu_clave === password;
      }

      if (!match) return null;

      return transformarUsuario(row);
    }
    throw err;
  }
}

async function actualizarUsuario(id, datos) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const fields = [];
    const values = [];

    if (datos.nombres !== undefined) {
      const partes = datos.nombres.trim().split(/\s+/).filter(Boolean);
      fields.push('usu_nombre1 = ?', 'usu_nombre2 = ?');
      values.push(partes[0] || '', partes[1] || '');
    }
    if (datos.apellidos !== undefined) {
      const partes = datos.apellidos.trim().split(/\s+/).filter(Boolean);
      fields.push('usu_apellido1 = ?', 'usu_apellido2 = ?');
      values.push(partes[0] || '', partes[1] || '');
    }
    if (datos.password !== undefined) {
      let passwordHash = datos.password;
      if (passwordHash && !passwordHash.startsWith('$2')) {
        passwordHash = await bcrypt.hash(passwordHash, 10);
      }
      fields.push('usu_clave = ?');
      values.push(passwordHash);
    }
    if (datos.telefono !== undefined) {
      fields.push('usu_telefono1 = ?');
      values.push(datos.telefono);
    }
    if (datos.direccion !== undefined) {
      fields.push('usu_direccion = ?');
      values.push(datos.direccion);
    }
    if (datos.ciudad !== undefined) {
      fields.push('usu_ciudad = ?');
      values.push(datos.ciudad);
    }
    if (datos.rol !== undefined) {
      fields.push('usu_nivel = ?');
      values.push(nivelDesdeRol(datos.rol));
    }
    if (datos.estado !== undefined) {
      fields.push('usu_estado = ?');
      values.push(datos.estado === 'inactivo' ? 2 : 1);
    }

    if (fields.length > 0) {
      values.push(id);
      const sql = `UPDATE usuarios SET ${fields.join(', ')} WHERE usu_codigo = ? AND usu_estado IN (1, 2)`;
      const [result] = await conn.query(sql, values);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return null;
      }
    }

    await upsertDetalle(conn, id, {
      email: datos.email,
      preferencias: datos.preferencias
    });

    await conn.commit();
    return await traerUsuarioPorId(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function eliminarUsuario(id) {
  const [result] = await pool.query(`
    UPDATE usuarios
    SET usu_estado = 2
    WHERE usu_codigo = ?
  `, [id]);
  return { affectedRows: result.affectedRows };
}

module.exports = {
  crearUsuario,
  traerUsuarios,
  traerUsuarioPorId,
  traerUsuarioPorCedula,
  validarUsuario,
  actualizarUsuario,
  eliminarUsuario
};
