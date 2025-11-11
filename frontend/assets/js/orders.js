import { requireAuth } from '/assets/js/auth.js';
import { renderHeader } from '/assets/js/ui.js';
import { apiFetch } from '/assets/js/api.js';
import { showToast } from '/assets/js/ui.js';

requireAuth();

let allOrders = [];
let isAdmin = false;
let isEmployee = false;

// Inicializar
window.addEventListener('DOMContentLoaded', async () => {
  // Verificar si es admin y obtener ID de usuario
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const role = payload.rol || payload.role || (payload.usu_nivel === 5 ? 'admin' : payload.usu_nivel === 4 ? 'empleado' : 'cliente');
      isAdmin = role === 'admin';
      isEmployee = role === 'empleado';
      window.__currentUserId = payload.id || payload.usu_codigo;
    } catch (e) {
      console.error('Error parsing token:', e);
    }
  }
  
  renderHeader({ active: 'orders' });
  await loadOrders();
});

// Cargar órdenes
async function loadOrders() {
  const container = document.getElementById('ordersContainer');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  
  try {
    loadingState.style.display = 'block';
    container.style.display = 'none';
    emptyState.style.display = 'none';
    
    const query = (isAdmin || isEmployee) ? '' : '?mine=true';
    const list = await apiFetch('ordenes', query);
    allOrders = Array.isArray(list) ? list : [];
    
    // Asegurar que los productos estén parseados correctamente
    allOrders = allOrders.map(order => {
      let productos = [];
      
      // Intentar parsear productos si viene como string
      if (order.productos) {
        if (typeof order.productos === 'string') {
          try {
            productos = JSON.parse(order.productos);
          } catch (e) {
            console.error('Error parseando productos:', e);
            productos = [];
          }
        } else if (Array.isArray(order.productos)) {
          productos = order.productos;
        } else if (typeof order.productos === 'object' && order.productos !== null) {
          // Si es un objeto, intentar convertirlo a array
          productos = [order.productos];
        }
      }
      
      return {
        ...order,
        productos: Array.isArray(productos) ? productos : []
      };
    });
    
    console.log('Órdenes cargadas:', allOrders.length);
    if (allOrders.length > 0) {
      console.log('Primera orden (ejemplo):', {
        id: allOrders[0].id_orden,
        productos: allOrders[0].productos,
        productosCount: allOrders[0].productos?.length,
        productosType: typeof allOrders[0].productos,
        isArray: Array.isArray(allOrders[0].productos)
      });
    }
    
    if (allOrders.length === 0) {
      loadingState.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    
    renderOrders();
    
  } catch (err) {
    console.error('Error cargando órdenes:', err);
    container.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Error al cargar órdenes</h3>
        <p class="empty-state-text">${err.message || 'Hubo un problema conectando con el servidor'}</p>
        <button class="button" onclick="location.reload()" style="margin-top: var(--spacing-md);">Reintentar</button>
      </div>
    `;
    container.style.display = 'block';
  } finally {
    loadingState.style.display = 'none';
  }
}

// Renderizar órdenes
function renderOrders() {
  const container = document.getElementById('ordersContainer');
  const emptyState = document.getElementById('emptyState');
  
  if (allOrders.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  container.style.display = 'block';
  emptyState.style.display = 'none';
  
  container.innerHTML = allOrders.map(order => {
    const id = order.id_orden || order.id || '';
    const fecha = order.fecha_creacion || order.fecha || order.created_at;
    const estado = order.estado || 'pendiente';
    
    // Los productos ya vienen parseados desde loadOrders
    const productos = Array.isArray(order.productos) ? order.productos : [];
    
    // Calcular total desde productos si no viene en order.total
    // Intentar obtener el total de diferentes campos posibles
    let total = Number(order.total || order.monto_total || order.totalCuenta || 0);
    
    // Si el total es 0 o no existe, calcularlo desde los productos
    if ((total === 0 || isNaN(total)) && productos.length > 0) {
      total = productos.reduce((sum, p) => {
        const precio = Number(p.precio || 0);
        const cantidad = Number(p.cantidad || 1);
        const subtotal = Number(p.subtotal || (precio * cantidad));
        return sum + subtotal;
      }, 0);
    }
    
    // Si aún es 0, intentar calcular desde el campo total de la BD directamente
    if ((total === 0 || isNaN(total)) && order.total) {
      total = Number(order.total);
    }
    
    // Información del cliente
    const nombresCliente = order.nombres_cliente || order.nombresCliente || '';
    const apellidosCliente = order.apellidos_cliente || order.apellidosCliente || '';
    const nombreCompleto = `${nombresCliente} ${apellidosCliente}`.trim() || 'Cliente sin nombre';
    const cedulaCliente = order.cedula_cliente || order.cedulaCliente || '';
    const emailCliente = order.email_cliente || order.emailCliente || '';
    const telefonoCliente = order.telefono_cliente || order.telefonoCliente || '';
    const direccionCliente = order.direccion_cliente || order.direccionCliente || '';
    const usernameCliente = order.username_cliente || order.usernameCliente || '';
    
    // Obtener nombres de productos
    const productosNombres = productos.length > 0
      ? productos
          .map(p => {
            const nombre = p.nombre || p.name || 'Producto sin nombre';
            return escapeHtml(nombre);
          })
          .join(', ')
      : 'Sin productos';
    
    const productosCount = productos.length;
    const estadoBadge = getEstadoBadge(estado);
    
    // Determinar si el usuario puede editar el estado
    const puedeEditarPropia = order.id_usuario && order.id_usuario === window.__currentUserId;
    const isCliente = !isAdmin && !isEmployee;
    const puedeCancelar = isCliente && puedeEditarPropia && estado !== 'cancelado' && estado !== 'completado';
    const canEditEstado = (isAdmin || isEmployee) || puedeCancelar; // Admin/empleado pueden cambiar cualquier estado, cliente solo cancelar
    
    return `
      <article class="card order-card" style="margin-bottom: var(--spacing-lg);">
        <div class="order-card__header">
          <div class="order-card__info">
            <h3 class="order-card__title">Orden #${id}</h3>
            <p class="order-card__date">${formatDate(fecha)}</p>
          </div>
          <div class="order-card__status">
            ${estadoBadge}
            ${isCliente && puedeEditarPropia ? `
              <div class="order-card__status-info" style="margin-top: var(--spacing-sm);">
                <span style="font-size: var(--font-size-sm); color: var(--color-text-muted);">Estado actual: </span>
                ${estadoBadge}
              </div>
              ${puedeCancelar ? `
                <button 
                  class="button" 
                  style="margin-top: var(--spacing-sm); background: linear-gradient(135deg, #F87171 0%, #EF4444 100%); color: #FFFFFF; border: none; padding: 0.625rem 1.25rem; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2), 0 2px 4px -1px rgba(239, 68, 68, 0.1); transition: all var(--transition-base); border-radius: var(--radius-lg);"
                  onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 12px -2px rgba(239, 68, 68, 0.3), 0 4px 6px -1px rgba(239, 68, 68, 0.15)';this.style.background='linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'"
                  onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 6px -1px rgba(239, 68, 68, 0.2), 0 2px 4px -1px rgba(239, 68, 68, 0.1)';this.style.background='linear-gradient(135deg, #F87171 0%, #EF4444 100%)'"
                  onclick="cancelarOrden('${id}')"
                >
                  <span style="display: inline-flex; align-items: center; gap: 0.375rem;">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;">
                      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Cancelar
                  </span>
                </button>
              ` : ''}
            ` : ''}
            ${(isAdmin || isEmployee) ? `
              <div class="order-card__status-edit">
                <label for="estado-${id}" class="order-card__status-label">Cambiar estado:</label>
                <select 
                  id="estado-${id}"
                  class="input order-status-select" 
                  data-order-id="${id}"
                  onchange="handleEstadoChange(this, '${id}')"
                >
                  <option value="pendiente" ${estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                  <option value="en_proceso" ${estado === 'en_proceso' ? 'selected' : ''}>En Proceso</option>
                  <option value="procesando" ${estado === 'procesando' ? 'selected' : ''}>Procesando</option>
                  <option value="enviado" ${estado === 'enviado' ? 'selected' : ''}>Enviado</option>
                  <option value="completado" ${estado === 'completado' ? 'selected' : ''}>Completado</option>
                  <option value="cancelado" ${estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="order-card__body">
          <!-- Información del Cliente -->
          <div class="order-card__customer">
            <div class="order-card__customer-header">
              <strong class="order-card__label">Información del Cliente:</strong>
            </div>
            <div class="order-card__customer-info">
              <div class="order-card__customer-item">
                <span class="order-card__customer-label">Nombre:</span>
                <span class="order-card__customer-value">${escapeHtml(nombreCompleto)}</span>
              </div>
              ${cedulaCliente ? `
                <div class="order-card__customer-item">
                  <span class="order-card__customer-label">Cédula:</span>
                  <span class="order-card__customer-value">${escapeHtml(String(cedulaCliente))}</span>
                </div>
              ` : ''}
              ${emailCliente ? `
                <div class="order-card__customer-item">
                  <span class="order-card__customer-label">Email:</span>
                  <span class="order-card__customer-value">${escapeHtml(emailCliente)}</span>
                </div>
              ` : ''}
              ${telefonoCliente ? `
                <div class="order-card__customer-item">
                  <span class="order-card__customer-label">Teléfono:</span>
                  <span class="order-card__customer-value">${escapeHtml(telefonoCliente)}</span>
                </div>
              ` : ''}
              ${direccionCliente ? `
                <div class="order-card__customer-item">
                  <span class="order-card__customer-label">Dirección:</span>
                  <span class="order-card__customer-value">${escapeHtml(direccionCliente)}</span>
                </div>
              ` : ''}
              ${usernameCliente ? `
                <div class="order-card__customer-item">
                  <span class="order-card__customer-label">Usuario:</span>
                  <span class="order-card__customer-value">${escapeHtml(usernameCliente)}</span>
                </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Productos -->
          <div class="order-card__products">
            <div class="order-card__products-header">
              <strong class="order-card__label">Productos:</strong>
              ${productosCount > 0 ? `
                <span class="badge badge--info" style="font-size: var(--font-size-xs);">
                  ${productosCount} ${productosCount === 1 ? 'producto' : 'productos'}
                </span>
              ` : ''}
            </div>
            <p class="order-card__products-list">
              ${productosNombres}
            </p>
          </div>
          
          ${productos.length > 0 ? `
            <div class="order-card__details">
              <details>
                <summary class="order-card__details-summary">
                  Ver detalles de productos
                </summary>
                <div class="order-card__products-detail">
                  ${productos.map((producto, idx) => `
                    <div class="order-product-item" ${idx < productos.length - 1 ? 'style="border-bottom: 1px solid var(--color-border-light);"' : ''}>
                      <div class="order-product-item__content">
                        <div class="order-product-item__info">
                          <strong class="order-product-item__name">${escapeHtml(producto.nombre || producto.name || 'Producto sin nombre')}</strong>
                          <p class="order-product-item__meta">
                            Cantidad: ${producto.cantidad || 1} × $${formatPrice(producto.precio || 0)}
                          </p>
                        </div>
                        <div class="order-product-item__price">
                          $${formatPrice(producto.subtotal || (producto.precio || 0) * (producto.cantidad || 1))}
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </details>
            </div>
          ` : ''}
        </div>
        
        <div class="order-card__footer">
          <div class="order-card__total">
            <p class="order-card__total-label">Total</p>
            <p class="order-card__total-amount">
              ${formatCurrency(total)}
            </p>
          </div>
          <a href="order_detail.html?id=${id}" class="button">
            Ver Detalle
          </a>
        </div>
      </article>
    `;
  }).join('');
}

// Obtener badge de estado
function getEstadoBadge(estado) {
  const estadoLower = (estado || '').toLowerCase();
  const estados = {
    'pendiente': { class: 'badge--warning', text: 'Pendiente' },
    'en_proceso': { class: 'badge--info', text: 'En Proceso' },
    'procesando': { class: 'badge--info', text: 'Procesando' },
    'enviado': { class: 'badge--info', text: 'Enviado' },
    'entregado': { class: 'badge--success', text: 'Entregado' },
    'completado': { class: 'badge--success', text: 'Completado' },
    'cancelado': { class: 'badge--error', text: 'Cancelado' }
  };
  
  const estadoInfo = estados[estadoLower] || estados['pendiente'];
  return `<span class="badge ${estadoInfo.class}">${estadoInfo.text}</span>`;
}

// Manejar cambio de estado
window.handleEstadoChange = async function(selectElement, orderId) {
  const nuevoEstado = selectElement.value;
  const order = allOrders.find(o => (o.id_orden || o.id) == orderId);
  const estadoAnterior = order?.estado || 'pendiente';
  
  // Validar que el estado cambió
  if (nuevoEstado === estadoAnterior) {
    return;
  }
  
  // Deshabilitar select mientras se actualiza
  selectElement.disabled = true;
  const originalValue = selectElement.value;
  
  try {
    // Actualizar estado en el servidor
    const response = await apiFetch('ordenes', `/${orderId}`, {
      method: 'PATCH',
      body: { estado: nuevoEstado }
    });
    
    // Actualizar estado local
    if (order) {
      order.estado = nuevoEstado;
    }
    
    // Re-renderizar para actualizar badges
    renderOrders();
    
    const estadoTexto = getEstadoTexto(nuevoEstado);
    showToast(`Estado actualizado a: ${estadoTexto}`);
    
  } catch (err) {
    console.error('Error actualizando estado:', err);
    
    // Revertir select al valor anterior
    selectElement.value = estadoAnterior;
    selectElement.disabled = false;
    
    const errorMsg = err.message || 'Error desconocido';
    showToast(`Error al actualizar el estado: ${errorMsg}`);
  } finally {
    selectElement.disabled = false;
  }
};

// Obtener texto del estado
function getEstadoTexto(estado) {
  const estados = {
    'pendiente': 'Pendiente',
    'procesando': 'Procesando',
    'enviado': 'Enviado',
    'entregado': 'Entregado',
    'cancelado': 'Cancelado'
  };
  return estados[estado.toLowerCase()] || estado;
}

// Formatear fecha
function formatDate(dateString) {
  if (!dateString) return '—';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(dateString);
  }
}

// Formatear precio
function formatPrice(price) {
  if (isNaN(price) || price === null || price === undefined) {
    return '0';
  }
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

// Escapar HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Formatear moneda
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(amount || 0);
}

// Función para cancelar orden (solo clientes)
window.cancelarOrden = async function(orderId) {
  if (!confirm('¿Estás seguro de que deseas cancelar esta orden?')) {
    return;
  }
  
  try {
    const response = await apiFetch('ordenes', `/${orderId}`, {
      method: 'PATCH',
      body: { status: 'cancelado' }
    });
    
    // Actualizar estado local
    const order = allOrders.find(o => (o.id_orden || o.id) == orderId);
    if (order) {
      order.estado = 'cancelado';
    }
    
    // Re-renderizar para actualizar badges
    renderOrders();
    
    showToast('Orden cancelada correctamente');
  } catch (err) {
    console.error('Error cancelando orden:', err);
    const errorMsg = err.message || 'Error desconocido';
    showToast(`Error al cancelar la orden: ${errorMsg}`);
  }
};








