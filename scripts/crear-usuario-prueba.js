#!/usr/bin/env node

/**
 * Script para crear usuarios de prueba en base10
 * Crea un usuario cliente y un usuario administrador
 */

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Leer configuración del .env manualmente
const envPath = path.join(__dirname, '..', 'Microservicios', 'Usuarios', '.env');
let config = {
  host: 'localhost',
  user: 'root',
  password: 'Emxx', // Password por defecto
  database: 'base10'
};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (key.trim() === 'DB_HOST') config.host = value;
        if (key.trim() === 'DB_USER') config.user = value;
        if (key.trim() === 'DB_PASS') config.password = value || 'Emxx';
        if (key.trim() === 'DB_NAME') config.database = value;
      }
    }
  });
}

async function crearUsuariosPrueba() {
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado a la base de datos\n');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS usuarios_detalle (
        usuario_id INT NOT NULL PRIMARY KEY,
        email VARCHAR(150) DEFAULT NULL,
        preferencias JSON DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Verificar tamaño de la columna usu_clave
    const [columnInfo] = await connection.execute(`
      SELECT CHARACTER_MAXIMUM_LENGTH 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'usu_clave'
    `, [config.database]);
    
    const maxLength = columnInfo[0]?.CHARACTER_MAXIMUM_LENGTH || 15;
    
    // Si la columna es muy pequeña (menos de 60), usar texto plano
    // bcrypt genera hashes de 60 caracteres
    let passwordCliente, passwordAdmin;
    if (maxLength >= 60) {
      // Hashear contraseñas si la columna es suficientemente grande
      passwordCliente = await bcrypt.hash('test123', 10);
      passwordAdmin = await bcrypt.hash('admin123', 10);
      console.log('ℹ️  Usando contraseñas hasheadas (bcrypt)\n');
    } else {
      // Usar texto plano si la columna es pequeña
      passwordCliente = 'test123';
      passwordAdmin = 'admin123';
      console.log(`ℹ️  Columna usu_clave es pequeña (${maxLength} chars), usando texto plano\n`);
    }

    // Crear usuario cliente
    const [resultCliente] = await connection.execute(`
      INSERT INTO usuarios 
        (usu_codigo, usu_cedula, usu_abreviado, usu_clave, usu_estado, usu_nivel,
         usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
         usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_fecha_ingreso) 
      VALUES 
        (1000, 1000000000, 'testuser', ?, 1, 3,
         'Usuario', 'Prueba', 'Test', '',
         'Calle de prueba 123', '3001234567', '', 'CALI', NOW())
      ON DUPLICATE KEY UPDATE
        usu_clave = ?,
        usu_estado = 1,
        usu_abreviado = 'testuser'
    `, [passwordCliente, passwordCliente]);

    console.log('✅ Usuario cliente creado/actualizado:');
    console.log('   Usuario: testuser');
    console.log('   Cédula: 1000000000');
    console.log('   Contraseña: test123');
    console.log('   Rol: Cliente\n');

    await connection.execute(`
      INSERT INTO usuarios_detalle (usuario_id, email, preferencias)
      VALUES (1000000000, ?, JSON_OBJECT('contacto', JSON_ARRAY('email'), 'boletin', true))
      ON DUPLICATE KEY UPDATE email = VALUES(email), preferencias = VALUES(preferencias)
    `, ['testuser@example.com']);

    // Crear usuario administrador
    const [resultAdmin] = await connection.execute(`
      INSERT INTO usuarios 
        (usu_codigo, usu_cedula, usu_abreviado, usu_clave, usu_estado, usu_nivel,
         usu_apellido1, usu_apellido2, usu_nombre1, usu_nombre2,
         usu_direccion, usu_telefono1, usu_telefono2, usu_ciudad, usu_fecha_ingreso) 
      VALUES 
        (1001, 2000000000, 'admin', ?, 1, 5,
         'Administrador', 'Sistema', 'Admin', '',
         'Oficina Principal', '3009876543', '', 'CALI', NOW())
      ON DUPLICATE KEY UPDATE
        usu_clave = ?,
        usu_estado = 1,
        usu_nivel = 5,
        usu_abreviado = 'admin'
    `, [passwordAdmin, passwordAdmin]);

    console.log('✅ Usuario administrador creado/actualizado:');
    console.log('   Usuario: admin');
    console.log('   Cédula: 2000000000');
    console.log('   Contraseña: admin123');
    console.log('   Rol: Administrador\n');

    await connection.execute(`
      INSERT INTO usuarios_detalle (usuario_id, email, preferencias)
      VALUES (2000000000, ?, JSON_OBJECT('contacto', JSON_ARRAY('email'), 'boletin', false))
      ON DUPLICATE KEY UPDATE email = VALUES(email), preferencias = VALUES(preferencias)
    `, ['admin@example.com']);

    console.log('✨ Usuarios de prueba listos!');
    console.log('\n📝 Puedes iniciar sesión en: http://localhost:8080/login.html');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

crearUsuariosPrueba();

