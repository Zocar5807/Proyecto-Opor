// src/middleware/auth.js (Contratos)
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro'; // Usa solo JWT_SECRET

function authenticateJWT(req, res, next) {
  console.log('--- authenticateJWT: headers recv ---');
  console.log(req.headers);

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || null;
  if (!authHeader) {
    console.warn('authenticateJWT: No Authorization header present');
    return res.status(401).json({ ok: false, msg: 'No token provided' });
  }

  const header = String(authHeader).trim();
  console.log('authenticateJWT: authorization header ->', header);

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    console.warn('authenticateJWT: Invalid Authorization header format', parts);
    return res.status(401).json({ ok: false, msg: 'Invalid Authorization header format. Use: Bearer <token>' });
  }

  const token = parts[1].trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('authenticateJWT: token verified. payload ->', payload);

    // Asignar tanto req.user como req.token para uso en el controlador
    req.user = {
      id: payload.sub || payload.userId || payload.id,
      role: payload.role || payload.roles || payload.rol || 'user',
      name: payload.name || payload.username || payload.nombre || null,
      raw: payload
    };
    req.token = token;  // Aquí está la asignación faltante

    return next();
  } catch (err) {
    console.error('authenticateJWT: jwt.verify failed ->', err.message);
    return res.status(401).json({ ok: false, msg: 'Invalid or expired token', error: err.message });
  }
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, msg: 'No authenticated user' });
    const role = (req.user.role || '').toString();
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ ok: false, msg: 'Forbidden: insufficient permissions' });
    }
    return next();
  };
}

module.exports = {
  authenticateJWT,
  authorizeRole
};