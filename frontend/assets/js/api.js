const SERVICES = {
  usuarios: 'http://localhost:3001/api/usuarios',
  productos: 'http://localhost:3002/api/productos',
  ordenes: 'http://localhost:3003/api/ordenes',
  solicitudes: 'http://localhost:3004/api/solicitudes',
  contratos: 'http://localhost:3005/api/contratos'
};

export function setServiceBase(serviceKey, baseUrl) {
  SERVICES[serviceKey] = baseUrl;
}

export async function apiFetch(service, path, { method = 'GET', headers = {}, body } = {}) {
  const token = window.__session?.token || localStorage.getItem('token');
  const urlBase = SERVICES[service] || '';
  const res = await fetch(`${urlBase}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
    cache: 'no-store'
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    location.href = 'login.html';
    return Promise.reject(new Error('Unauthorized'));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Network error');
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return res.text();
  }
  const json = await res.json();
  return (json && typeof json === 'object' && 'data' in json) ? json.data : json;
}

