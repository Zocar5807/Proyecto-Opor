export function saveSession({ token, role, user }) {
  window.__session = { token, role, user };
  if (token) localStorage.setItem('token', token);
  if (role) localStorage.setItem('role', role);
}

export function logout() {
  window.__session = null;
  localStorage.removeItem('token');
  localStorage.removeItem('role');
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

export function requireAuth(requiredRole) {
  const token = window.__session?.token || localStorage.getItem('token');
  const role = getRole();
  if (!token) {
    location.href = 'login.html';
    return;
  }
  if (requiredRole && role !== requiredRole) {
    location.href = 'index.html';
  }
}

