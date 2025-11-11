export function saveSession({ token, role, user }) {
  window.__session = { token, role, user };
  if (token) localStorage.setItem('token', token);
  if (role) localStorage.setItem('role', role);
  if (user) localStorage.setItem('sessionUser', JSON.stringify(user));
}

export function logout() {
  window.__session = null;
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('sessionUser');
  location.href = 'login.html';
}

export function getRole() {
  return window.__session?.role || localStorage.getItem('role');
}

export function getToken() {
  return window.__session?.token || localStorage.getItem('token');
}

export function parseJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}

export function getUserId() {
  const token = getToken();
  const payload = token ? parseJwt(token) : {};
  return payload.id || payload.usu_codigo || payload.userId || null;
}

export function getPayload() {
  const token = getToken();
  return token ? parseJwt(token) : {};
}

export function getCurrentUser() {
  if (window.__session?.user) return window.__session.user;
  const stored = localStorage.getItem('sessionUser');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (err) {
    return null;
  }
}

export function requireAuth(requiredRole) {
  const token = getToken();
  const role = getRole();
  if (!token) {
    location.href = 'login.html';
    return;
  }

  if (requiredRole) {
    const rolesPermitidos = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!rolesPermitidos.includes(role)) {
      location.href = 'index.html';
      return;
    }
  }

  if (!window.__session) {
    window.__session = { token, role, user: getCurrentUser() };
  }
}

