const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_superseguro';

function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ ok:false, msg:'No token provided' });

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ ok:false, msg:'Formato Authorization inválido. Use: Bearer <token>' });
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // contiene al menos id/ sub / username / role según tu login
    return next();
  } catch (err) {
    return res.status(401).json({ ok:false, msg:'Token inválido o expirado', error: err.message });
  }
}

function requireAdmin(req, res, next) {
  const role = req.user && (req.user.role || req.user.roles || req.user.rol);
  if (!role) return res.status(403).json({ ok:false, msg:'No role in token' });
  if (String(role).toLowerCase() !== 'admin' && String(role).toLowerCase() !== 'administrador') {
    return res.status(403).json({ ok:false, msg:'Acceso denegado: admin requerido' });
  }
  return next();
}

module.exports = { authenticateJWT, requireAdmin };

