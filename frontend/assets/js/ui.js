export function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function renderHeader({ active = '' } = {}) {
  const header = document.querySelector('header');
  if (!header) return;

  let role = 'cliente';
  try {
    const token = window.__session?.token || localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      role = payload.rol || payload.role || (payload.usu_nivel === 5 ? 'admin' : (payload.usu_nivel === 4 ? 'empleado' : 'cliente'));
      if (!window.__session) {
        window.__session = { token, role, user: payload };
      } else if (!window.__session.role) {
        window.__session.role = role;
      }
    }
  } catch (err) {
    role = 'cliente';
  }

  const isAdmin = role === 'admin';
  const isEmployee = role === 'empleado';

  let navLinks = '';
  if (isAdmin) {
    navLinks = `
      <a href="admin_dashboard.html" class="${active==='dashboard'?'badge badge--primary':''}">Dashboard</a>
      <a href="admin_users.html" class="${active==='users'?'badge badge--primary':''}">Usuarios</a>
      <a href="admin_products.html" class="${active==='products'?'badge badge--primary':''}">Productos</a>
      <a href="admin_orders.html" class="${active==='orders'?'badge badge--primary':''}">Órdenes</a>
      <a href="admin_requests.html" class="${active==='requests'?'badge badge--primary':''}">Solicitudes</a>
      <a href="admin_contracts.html" class="${active==='contracts'?'badge badge--primary':''}">Contratos</a>
      <a href="admin_liquidity.html" class="${active==='liquidity'?'badge badge--primary':''}">Liquidez</a>
      <a href="admin_transfers.html" class="${active==='transfers'?'badge badge--primary':''}">Transferencias</a>
    `;
  } else if (isEmployee) {
    navLinks = `
      <a href="employee_dashboard.html" class="${active==='dashboard'?'badge badge--primary':''}">Panel</a>
      <a href="admin_orders.html" class="${active==='orders'?'badge badge--primary':''}">Órdenes</a>
      <a href="admin_requests.html" class="${active==='requests'?'badge badge--primary':''}">Solicitudes</a>
      <a href="admin_contracts.html" class="${active==='contracts'?'badge badge--primary':''}">Contratos</a>
    `;
  } else {
    navLinks = `
      <a href="products.html" class="${active==='products'?'badge badge--primary':''}">Productos</a>
      <a href="orders.html" class="${active==='orders'?'badge badge--primary':''}">Mis Órdenes</a>
      <a href="requests.html">Solicitudes</a>
      <a href="contracts.html">Contratos</a>
      <a href="profile.html">Perfil</a>
    `;
  }

  header.innerHTML = `
    <div class="header">
      <div class="header__container">
        <a href="index.html" class="header__logo">
          <img src="/assets/img/logo.svg" alt="La Oportunidad"/>
        </a>
        <nav class="header__nav">
          ${navLinks}
          <a href="#" id="logoutLink">Salir</a>
        </nav>
      </div>
    </div>`;

  // Bind logout handler once header is rendered
  const logout = document.getElementById('logoutLink');
  if (logout) {
    logout.addEventListener('click', (e)=>{
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('sessionUser');
      if (window.__session) window.__session = null;
      window.location.href = 'login.html';
    });
  }
}

