import { requireAuth } from '/assets/js/auth.js';
import { apiFetch } from '/assets/js/api.js';
import { renderHeader } from '/assets/js/ui.js';

requireAuth();

let allProducts = [];
let filteredProducts = [];
let currentSearchTerm = '';
let currentFilter = 'all';
let currentCategoria = '';
let currentEstado = '';
let currentSucursal = '';
let precioMin = '';
let precioMax = '';
let categoriasDisponibles = [];
let sucursalesDisponibles = [];

// Cache para búsquedas y ordenamientos
let searchCache = new Map();
let sortedCache = new Map();

// Índices para búsquedas rápidas
let searchIndex = {
  nombres: new Map(), // Map<substring, Set<index>>
  descripciones: new Map()
};

// Limpiar cache cuando se cargan nuevos productos
function clearCache() {
  searchCache.clear();
  sortedCache.clear();
  searchIndex = {
    nombres: new Map(),
    descripciones: new Map()
  };
}

// Construir índice de búsqueda para acceso O(1)
function buildSearchIndex(products) {
  const index = {
    nombres: new Map(),
    descripciones: new Map()
  };
  
  // Construir índices de substrings (solo primeras 3 letras para no usar demasiada memoria)
  products.forEach((product, idx) => {
    const nombre = (product.nombre || '').toLowerCase();
    const descripcion = (product.descripcion || '').toLowerCase();
    
    // Indexar por prefijos de 2-4 caracteres
    for (let len = 2; len <= Math.min(4, nombre.length); len++) {
      const prefix = nombre.substring(0, len);
      if (!index.nombres.has(prefix)) {
        index.nombres.set(prefix, new Set());
      }
      index.nombres.get(prefix).add(idx);
    }
    
    for (let len = 2; len <= Math.min(4, descripcion.length); len++) {
      const prefix = descripcion.substring(0, len);
      if (!index.descripciones.has(prefix)) {
        index.descripciones.set(prefix, new Set());
      }
      index.descripciones.get(prefix).add(idx);
    }
  });
  
  return index;
}

// Inicializar
window.addEventListener('DOMContentLoaded', async () => {
  renderHeader({ active: 'products' });
  
  // Cargar categorías y sucursales primero
  await loadFilterOptions();
  
  // Configurar event delegation para filtros
  setupFilterDelegation();
  
  // Configurar búsqueda
  setupSearch();
  
  // Configurar filtros avanzados
  setupAdvancedFilters();
  
  // Cargar productos
  await loadProducts();
});

// Cargar opciones de filtros (categorías y sucursales)
async function loadFilterOptions() {
  try {
    const [categorias, sucursales] = await Promise.all([
      apiFetch('productos', '/categorias'),
      apiFetch('productos', '/sucursales')
    ]);
    
    categoriasDisponibles = Array.isArray(categorias) ? categorias : (categorias?.data || []);
    sucursalesDisponibles = Array.isArray(sucursales) ? sucursales : (sucursales?.data || []);
    
    // Llenar select de categorías
    const categoriaSelect = document.getElementById('categoriaFilter');
    if (categoriaSelect) {
      categoriasDisponibles.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${cat.nombre} (${cat.cantidad})`;
        categoriaSelect.appendChild(option);
      });
    }
    
    // Llenar select de sucursales
    const sucursalSelect = document.getElementById('sucursalFilter');
    if (sucursalSelect) {
      sucursalesDisponibles.forEach(suc => {
        const option = document.createElement('option');
        option.value = suc.id;
        option.textContent = `${suc.nombre} (${suc.cantidad})`;
        sucursalSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Error cargando opciones de filtros:', err);
  }
}

// Configurar filtros avanzados
function setupAdvancedFilters() {
  const categoriaFilter = document.getElementById('categoriaFilter');
  const estadoFilter = document.getElementById('estadoFilter');
  const sucursalFilter = document.getElementById('sucursalFilter');
  const precioMinInput = document.getElementById('precioMin');
  const precioMaxInput = document.getElementById('precioMax');
  
  let filterTimeout;
  
  const applyAdvancedFilters = () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      currentCategoria = categoriaFilter?.value || '';
      currentEstado = estadoFilter?.value || '';
      currentSucursal = sucursalFilter?.value || '';
      precioMin = precioMinInput?.value || '';
      precioMax = precioMaxInput?.value || '';
      applyCurrentFilters();
    }, 300);
  };
  
  if (categoriaFilter) categoriaFilter.addEventListener('change', applyAdvancedFilters);
  if (estadoFilter) estadoFilter.addEventListener('change', applyAdvancedFilters);
  if (sucursalFilter) sucursalFilter.addEventListener('change', applyAdvancedFilters);
  if (precioMinInput) precioMinInput.addEventListener('input', applyAdvancedFilters);
  if (precioMaxInput) precioMaxInput.addEventListener('input', applyAdvancedFilters);
}

// Configurar event delegation para filtros
function setupFilterDelegation() {
  const filtersContainer = document.getElementById('filtersContainer');
  if (!filtersContainer) {
    console.error('No se encontró el contenedor de filtros');
    return;
  }
  
  filtersContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const filter = chip.dataset.filter;
    if (!filter) return;
    
    applyFilter(filter);
  });
}

// Configurar búsqueda
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  
  let searchTimeout;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const value = e.target.value.toLowerCase().trim();
    // Debounce más largo para muchas búsquedas
    searchTimeout = setTimeout(() => {
      currentSearchTerm = value;
      applyCurrentFilters();
    }, 200);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimeout);
      currentSearchTerm = e.target.value.toLowerCase().trim();
      applyCurrentFilters();
    }
  });
}

// Aplicar filtro específico
function applyFilter(filter) {
  if (currentFilter === filter) return;
  
  currentFilter = filter;
  
  // Actualizar UI
  const chips = document.querySelectorAll('.filter-chip');
  const activeChip = document.querySelector(`[data-filter="${filter}"]`);
  
  chips.forEach(c => c.classList.remove('active'));
  if (activeChip) {
    activeChip.classList.add('active');
  }
  
  // Aplicar filtros
  applyCurrentFilters();
}

// Cargar productos desde la API
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  
  try {
    loadingState.style.display = 'block';
    grid.style.display = 'none';
    emptyState.style.display = 'none';
    
    const response = await apiFetch('productos', '');
    
    // Normalizar y pre-procesar datos
    const list = Array.isArray(response) ? response : (response?.data || []);
    allProducts = list.map((p, idx) => {
      const nombre = cleanProductName(p.nombre || p.name || p.descripcion || p.art_descripcion || 'Producto sin nombre');
      const descripcion = cleanProductDescription(p.descripcion || p.description || p.art_descripcion || '');
      
      return {
        id: p.id || p.art_consecutivo || p.consecutivo,
        nombre: nombre,
        nombreLower: nombre.toLowerCase(), // Pre-calcular
        descripcion: descripcion,
        descripcionLower: descripcion.toLowerCase(), // Pre-calcular
        precio: parseFloat(p.precio || p.price || p.art_valor || 0),
        imagen: p.imagen || p.image || p.imagen1 || (Array.isArray(p.imagenes) ? p.imagenes[0] : ''),
        cantidad: p.cantidad || p.stock || 0,
        estado: p.estado || (p.art_sino === 2 ? 'garantia' : 'a_venta'),
        categoria: p.categoria || (p.art_clase === 1 ? 'Joyas' : (p.art_clase === 2 ? 'Mercancía' : 'Vehículos')),
        sucursal: p.sucursal || String(p.art_lugar || ''),
        _index: idx // Guardar índice original
      };
    }).filter(p => p.id);
    
    console.log(`Cargados ${allProducts.length} productos`);
    
    // Construir índice de búsqueda
    console.log('Construyendo índice de búsqueda...');
    searchIndex = buildSearchIndex(allProducts);
    console.log('Índice construido');
    
    clearCache();
    filteredProducts = [...allProducts];
    
    // Actualizar contador primero
    updateProductCount();
    
    // Renderizar inicialmente solo los primeros productos (lazy loading)
    renderProductsLazy();
    
  } catch (err) {
    console.error('Error cargando productos:', err);
    grid.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Error al cargar productos</h3>
        <p class="empty-state-text">${err.message || 'Hubo un problema conectando con el servidor'}</p>
        <button class="button" onclick="location.reload()" style="margin-top: var(--spacing-md);">Reintentar</button>
      </div>
    `;
    grid.style.display = 'block';
  } finally {
    loadingState.style.display = 'none';
  }
}

// Limpiar y formatear nombre de producto
function cleanProductName(name) {
  if (!name) return 'Producto sin nombre';
  
  let cleaned = String(name).trim();
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  const prepositions = ['de', 'del', 'la', 'el', 'y', 'o', 'a', 'en', 'con', 'por', 'para'];
  cleaned = cleaned.split(' ').map((word, index) => {
    const lowerWord = word.toLowerCase();
    if (index === 0 || !prepositions.includes(lowerWord)) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return lowerWord;
  }).join(' ');
  
  if (cleaned.length > 60) {
    cleaned = cleaned.substring(0, 57) + '...';
  }
  
  return cleaned;
}

// Limpiar descripción de producto
function cleanProductDescription(desc) {
  if (!desc) return '';
  
  let cleaned = String(desc).trim();
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n+/g, ' ');
  
  if (cleaned.length > 120) {
    cleaned = cleaned.substring(0, 117) + '...';
  }
  
  return cleaned;
}

// Renderizar productos con lazy loading (por chunks)
let renderChunkSize = 50; // Renderizar 50 productos a la vez
let renderedCount = 0;
let renderTimeout = null;

function renderProductsLazy() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  
  if (filteredProducts.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    renderedCount = 0;
    return;
  }
  
  grid.style.display = 'grid';
  emptyState.style.display = 'none';
  
  // Cancelar renderizado anterior si existe
  if (renderTimeout) {
    cancelAnimationFrame(renderTimeout);
  }
  
  renderedCount = 0;
  const total = filteredProducts.length;
  
  // Renderizar primeros productos inmediatamente
  renderChunk();
  
  function renderChunk() {
    const start = renderedCount;
    const end = Math.min(start + renderChunkSize, total);
    const chunk = filteredProducts.slice(start, end);
    
    if (chunk.length === 0) {
      // Ya se actualizó el contador antes del renderizado
      return;
    }
    
    // Construir HTML del chunk
    const chunkHTML = chunk.map(product => createProductHTML(product)).join('');
    
    if (start === 0) {
      // Primera vez: limpiar y agregar
      grid.innerHTML = chunkHTML;
    } else {
      // Agregar chunk al final
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chunkHTML;
      while (tempDiv.firstChild) {
        grid.appendChild(tempDiv.firstChild);
      }
    }
    
    renderedCount = end;
    
    // Continuar renderizando si hay más productos
    if (end < total) {
      renderTimeout = requestAnimationFrame(renderChunk);
    }
    // El contador ya se actualizó antes del renderizado, no es necesario actualizarlo de nuevo
  }
}

// Crear HTML de un producto (función separada para mejor performance)
function createProductHTML(product) {
  const nombre = escapeHtml(product.nombre);
  const descripcion = product.descripcion && product.descripcion !== product.nombre 
    ? escapeHtml(product.descripcion) 
    : '';
  const precio = formatPrice(product.precio);
  const imagen = product.imagen ? escapeHtml(product.imagen) : '';
  const stock = product.cantidad !== undefined && product.cantidad > 0 ? product.cantidad : 0;
  
  let html = '<article class="card product-card">';
  
  if (imagen) {
    html += `<img src="${imagen}" alt="${nombre}" class="product-card__image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`;
    html += '<div class="product-card__image" style="display: none; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100));"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.3;"><path d="M20 7L12 3L4 7M20 7L12 11M20 7V17L12 21M12 11L4 7M12 11V21M4 7V17L12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  } else {
    html += '<div class="product-card__image" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100));"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.3;"><path d="M20 7L12 3L4 7M20 7L12 11M20 7V17L12 21M12 11L4 7M12 11V21M4 7V17L12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  }
  
  html += '<div class="product-card__body">';
  html += `<h3 class="product-card__title" title="${nombre}">${nombre}</h3>`;
  
  if (descripcion) {
    html += `<p class="product-card__description" title="${descripcion}">${descripcion}</p>`;
  }
  
  html += `<div class="product-card__price">$${precio}</div>`;
  
  // Mostrar información adicional: categoría, estado, sucursal
  const metaInfo = [];
  if (product.categoria) {
    metaInfo.push(`<span class="badge badge--info" style="font-size: var(--font-size-xs);">${escapeHtml(product.categoria)}</span>`);
  }
  if (product.estado) {
    const estadoBadge = product.estado === 'garantia' ? 'badge--warning' : 'badge--success';
    metaInfo.push(`<span class="badge ${estadoBadge}" style="font-size: var(--font-size-xs);">${escapeHtml(product.estado === 'garantia' ? 'En garantía' : 'A la venta')}</span>`);
  }
  if (product.sucursal) {
    metaInfo.push(`<span class="badge badge--secondary" style="font-size: var(--font-size-xs);">Suc. ${escapeHtml(product.sucursal)}</span>`);
  }
  
  if (metaInfo.length > 0) {
    html += `<div style="display: flex; flex-wrap: wrap; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm);">${metaInfo.join('')}</div>`;
  }
  
  if (stock > 0) {
    html += `<div style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--spacing-md);"><span class="badge badge--success" style="font-size: var(--font-size-xs);">Stock: ${stock}</span></div>`;
  } else if (product.cantidad === 0) {
    html += '<div style="font-size: var(--font-size-sm); margin-bottom: var(--spacing-md);"><span class="badge badge--error" style="font-size: var(--font-size-xs);">Sin stock</span></div>';
  }
  
  html += '<div class="product-card__footer">';
  html += `<a href="product_detail.html?id=${product.id}" class="button product-card__button">Ver Detalle</a>`;
  html += '</div></div></article>';
  
  return html;
}

// Aplicar filtros actuales - ULTRA OPTIMIZADO para 46k+ productos
function applyCurrentFilters() {
  const startTime = performance.now();
  
  // Empezar con todos los productos
  let workingSet = [...allProducts];
  
  // Aplicar filtros de categoría, estado, sucursal y precio (si están activos)
  if (currentCategoria) {
    const categoriaMap = { 1: 'Joyas', 2: 'Mercancía', 3: 'Vehículos' };
    const categoriaNombre = categoriaMap[Number(currentCategoria)] || currentCategoria;
    workingSet = workingSet.filter(p => p.categoria === categoriaNombre);
  }
  
  if (currentEstado) {
    workingSet = workingSet.filter(p => p.estado === currentEstado);
  }
  
  if (currentSucursal) {
    workingSet = workingSet.filter(p => String(p.sucursal) === String(currentSucursal));
  }
  
  if (precioMin) {
    const min = parseFloat(precioMin);
    if (!isNaN(min)) {
      workingSet = workingSet.filter(p => (p.precio || 0) >= min);
    }
  }
  
  if (precioMax) {
    const max = parseFloat(precioMax);
    if (!isNaN(max)) {
      workingSet = workingSet.filter(p => (p.precio || 0) <= max);
    }
  }
  
  // Aplicar búsqueda optimizada
  if (currentSearchTerm) {
    const searchLower = currentSearchTerm.toLowerCase();
    workingSet = workingSet.filter(product => 
      product.nombreLower.includes(searchLower) || 
      product.descripcionLower.includes(searchLower)
    );
  }
  
  filteredProducts = workingSet;
  
  // Aplicar ordenamiento
  if (currentFilter !== 'all') {
    switch (currentFilter) {
      case 'precio-asc':
        filteredProducts.sort((a, b) => (a.precio || 0) - (b.precio || 0));
        break;
        
      case 'precio-desc':
        filteredProducts.sort((a, b) => (b.precio || 0) - (a.precio || 0));
        break;
        
      case 'nombre-asc':
        filteredProducts.sort((a, b) => {
          const nameA = a.nombreLower;
          const nameB = b.nombreLower;
          return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
        });
        break;
        
      case 'nombre-desc':
        filteredProducts.sort((a, b) => {
          const nameA = a.nombreLower;
          const nameB = b.nombreLower;
          return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
        });
        break;
    }
  }
  
  // Actualizar contador inmediatamente (antes del renderizado)
  updateProductCount();
  
  // Renderizar con lazy loading
  renderProductsLazy();
  
  const endTime = performance.now();
  console.log(`Filtrado de ${filteredProducts.length} productos completado en ${(endTime - startTime).toFixed(2)}ms`);
}

// Actualizar contador de productos
function updateProductCount() {
  const count = filteredProducts ? filteredProducts.length : 0;
  const total = allProducts ? allProducts.length : 0;
  const countElement = document.getElementById('productCount');
  
  if (!countElement) {
    console.warn('No se encontró el elemento productCount');
    return;
  }
  
  if (currentSearchTerm || currentFilter !== 'all') {
    countElement.textContent = `${count} de ${total} ${count === 1 ? 'producto' : 'productos'}`;
  } else {
    countElement.textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
  }
  
  console.log(`Contador actualizado: ${count} productos`);
}

// Utilidades
function formatPrice(price) {
  if (isNaN(price) || price === null || price === undefined) {
    return '0';
  }
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}








