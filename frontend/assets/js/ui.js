export function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function renderHeader({ active = '', isAdmin = false } = {}) {
  const header = document.querySelector('header');
  if (!header) return;
  header.innerHTML = `
    <div class="header container">
      <a href="index.html"><img class="header__logo" src="../assets/img/logo.svg" alt="La Oportunidad"/></a>
      <nav class="header__nav">
        ${isAdmin ? `
          <a href="admin_dashboard.html" class="${active==='dashboard'?'badge':''}">Dashboard</a>
          <a href="admin_users.html">Usuarios</a>
          <a href="admin_products.html">Productos</a>
          <a href="admin_orders.html">Órdenes</a>
          <a href="admin_requests.html">Solicitudes</a>
          <a href="admin_contracts.html">Contratos</a>
        ` : `
          <a href="products.html" class="${active==='products'?'badge':''}">Productos</a>
          <a href="orders.html">Mis Órdenes</a>
          <a href="requests.html">Solicitudes</a>
          <a href="contracts.html">Contratos</a>
          <a href="profile.html">Perfil</a>
        `}
        <a href="#" id="logoutLink">Salir</a>
      </nav>
    </div>`;

  // Bind logout handler once header is rendered
  const logout = document.getElementById('logoutLink');
  if (logout) {
    logout.addEventListener('click', (e)=>{
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      if (window.__session) window.__session = null;
      window.location.href = 'login.html';
    });
  }
}

