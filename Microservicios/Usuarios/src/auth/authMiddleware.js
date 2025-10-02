// middlewares/authMiddleware.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';

function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ ok:false, msg:'No token provided' });

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ ok:false, msg:'Invalid Authorization format' });

  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id || payload.usu_codigo || payload.userId,
      nombres: payload.nombres || payload.nombre || null,
      apellidos: payload.apellidos || null,
      cedula: payload.cedula || null,
      direccion: payload.direccion || null,
      username: payload.username || payload.user || null,
      rol: payload.rol || 'cliente',
      raw: payload
    };
    return next();
  } catch (err) {
    return res.status(401).json({ ok:false, msg:'Invalid or expired token', error: err.message });
  }
}

function requireAdmin(req, res, next) {
  const rol = req.user && req.user.rol;
  if (!rol) return res.status(403).json({ ok:false, msg:'No role found in token' });
  const r = String(rol).toLowerCase();
  if (r !== 'admin' && r !== 'administrador') return res.status(403).json({ ok:false, msg:'Access denied: admin required' });
  return next();
}

module.exports = { authenticateJWT, requireAdmin };
