// src/db.js
const mysql = require('mysql2/promise');

/**
 * Pool de conexiones para MySQL usando mysql2/promise.
 * Lee configuración desde process.env (usa .env).
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'base00',
  waitForConnections: true,   // espera si no hay conexiones libres
  connectionLimit: 10,        // máximo conexiones simultáneas
  queueLimit: 0               // 0 = sin límite en cola
});

module.exports = pool;
