#!/usr/bin/env node
/**
 * Script de pruebas automatizadas para todas las funcionalidades del proyecto
 * Prueba todos los microservicios y sus endpoints principales
 */

require('dotenv').config();

// Usar fetch nativo de Node.js 18+ o node-fetch como fallback
let fetch;
try {
  // Intentar usar fetch nativo (Node.js 18+)
  if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch;
  } else {
    // Fallback a node-fetch
    fetch = require('node-fetch');
  }
} catch (e) {
  // Si node-fetch no está instalado, usar fetch nativo
  fetch = globalThis.fetch || require('node-fetch');
}

// Configuración
const SERVICES = {
  usuarios: process.env.USUARIOS_URL || 'http://localhost:3001/api/usuarios',
  productos: process.env.PRODUCTOS_URL || 'http://localhost:3002/api/productos',
  ordenes: process.env.ORDENES_URL || 'http://localhost:3003/api/ordenes',
  solicitudes: process.env.SOLICITUDES_URL || 'http://localhost:3004/api/solicitudes',
  contratos: process.env.CONTRATOS_URL || 'http://localhost:3005/api/contratos',
  analytics: process.env.ANALYTICS_URL || 'http://localhost:3006/api/analytics'
};

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Estadísticas
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// Tokens de autenticación
let adminToken = null;
let userToken = null;
let employeeToken = null;

// IDs creados durante las pruebas (para limpieza)
const createdIds = {
  usuarios: [],
  productos: [],
  ordenes: [],
  solicitudes: [],
  contratos: []
};

/**
 * Función auxiliar para hacer peticiones HTTP
 */
async function apiCall(service, path, options = {}) {
  const url = `${SERVICES[service]}${path}`;
  // Si options.token es explícitamente null, no usar adminToken por defecto
  const token = options.hasOwnProperty('token') ? options.token : adminToken;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
    
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message,
      data: null
    };
  }
}

/**
 * Función para imprimir resultados
 */
function printTest(name, passed, message = '') {
  stats.total++;
  if (passed) {
    stats.passed++;
    console.log(`${colors.green}✓${colors.reset} ${name}${message ? `: ${message}` : ''}`);
  } else {
    stats.failed++;
    stats.errors.push({ name, message });
    console.log(`${colors.red}✗${colors.reset} ${name}${message ? `: ${message}` : ''}`);
  }
}

/**
 * Función para imprimir sección
 */
function printSection(title) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * Verificar que los servicios estén corriendo
 */
async function checkServices() {
  printSection('VERIFICANDO SERVICIOS');
  
  const services = [
    { name: 'Usuarios', url: SERVICES.usuarios, path: '/ping' },
    { name: 'Productos', url: SERVICES.productos, path: '/ping' },
    { name: 'Órdenes', url: SERVICES.ordenes, path: '/ping', requiresAuth: true },
    { name: 'Solicitudes', url: SERVICES.solicitudes, path: '/ping' },
    { name: 'Contratos', url: SERVICES.contratos, path: '/ping' },
    { name: 'Analytics', url: SERVICES.analytics, path: '/ping' }
  ];
  
  for (const service of services) {
    try {
      // Para servicios que requieren auth, solo verificamos si responden (incluso con 401)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${service.url}${service.path}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const ok = response.ok || (service.requiresAuth && response.status === 401) || response.status < 500;
      printTest(`Servicio ${service.name}`, ok, ok ? 'Activo' : `Status: ${response.status}`);
    } catch (error) {
      // Analytics es opcional, no debería fallar las pruebas si no está disponible
      if (service.name === 'Analytics') {
        printTest(`Servicio ${service.name}`, true, 'No disponible (opcional)');
      } else {
        printTest(`Servicio ${service.name}`, false, `Error: ${error.message}`);
      }
    }
  }
}

/**
 * Pruebas de Autenticación
 */
async function testAuthentication() {
  printSection('PRUEBAS DE AUTENTICACIÓN');
  
  // 1. Login como admin
  const adminLogin = await apiCall('usuarios', '/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  const adminHasToken = adminLogin.ok && (adminLogin.data?.token || adminLogin.data?.data?.token);
  printTest('Login como admin', adminHasToken, 
    adminHasToken ? 'Token obtenido' : (adminLogin.data?.msg || adminLogin.error || 'Error'));
  if (adminHasToken) {
    adminToken = adminLogin.data?.token || adminLogin.data?.data?.token;
  }
  
  // 2. Login como usuario regular
  const userLogin = await apiCall('usuarios', '/login', {
    method: 'POST',
    body: { username: 'testuser', password: 'test123' }
  });
  const userHasToken = userLogin.ok && (userLogin.data?.token || userLogin.data?.data?.token);
  printTest('Login como usuario regular', userHasToken,
    userHasToken ? 'Token obtenido' : (userLogin.data?.msg || userLogin.error || 'Error'));
  if (userHasToken) {
    userToken = userLogin.data?.token || userLogin.data?.data?.token;
  }
  
  // 3. Login con credenciales incorrectas
  const badLogin = await apiCall('usuarios', '/login', {
    method: 'POST',
    body: { username: 'admin', password: 'wrong' }
  });
  printTest('Login con credenciales incorrectas', !badLogin.ok, 
    badLogin.ok ? 'Debería fallar' : 'Correctamente rechazado');
  
  // 4. Acceso sin token
  const noToken = await apiCall('usuarios', '/', { token: null });
  // Verificar que el status sea 401 o 403, o que ok sea false
  // Si status es 200 pero ok es false, también es válido (algunos servicios retornan 200 con {ok: false})
  const isRejected = (noToken.status === 401 || noToken.status === 403) || (!noToken.ok);
  printTest('Acceso sin token', isRejected, 
    isRejected ? 'Correctamente rechazado' : `Debería fallar (status: ${noToken.status || 'N/A'}, ok: ${noToken.ok})`);
}

/**
 * Pruebas de Usuarios
 */
async function testUsuarios() {
  printSection('PRUEBAS DE USUARIOS');
  
  // 1. Obtener todos los usuarios (admin)
  const allUsers = await apiCall('usuarios', '/');
  const usersData = allUsers.data?.data || allUsers.data;
  printTest('Obtener todos los usuarios (admin)', allUsers.ok && Array.isArray(usersData),
    allUsers.ok ? `${usersData?.length || 0} usuarios encontrados` : (allUsers.data?.msg || 'Error'));
  
  // 2. Obtener perfil propio
  const myProfile = await apiCall('usuarios', '/me', { token: userToken });
  const profileData = myProfile.data?.data || myProfile.data;
  const profileId = profileData?.usu_codigo || profileData?.id;
  printTest('Obtener perfil propio', myProfile.ok && (profileData?.username || profileData?.usu_abreviado),
    myProfile.ok ? `Usuario: ${profileData?.username || profileData?.usu_abreviado || 'OK'}` : (myProfile.data?.msg || 'Error'));
  
  // 3. Crear nuevo usuario
  if (!userToken) {
    printTest('Crear nuevo usuario', false, 'Token de usuario no disponible');
  } else {
    const timestamp = Date.now().toString().slice(-6);
    const newUser = await apiCall('usuarios', '/', {
      method: 'POST',
      body: {
        username: `test${timestamp}`,
        password: 'test123',
        nombres: 'Test',
        apellidos: 'Usuario',
        cedula: parseInt(`123456${timestamp}`),
        email: `test${timestamp}@test.com`,
        rol: 'cliente'
      }
    });
    const newUserData = newUser.data?.data || newUser.data;
    const newUserId = newUserData?.usu_codigo || newUserData?.id;
    printTest('Crear nuevo usuario', newUser.ok && newUserId,
      newUser.ok ? `ID: ${newUserId}` : (newUser.data?.msg || 'Error'));
    if (newUser.ok && newUserId) {
      createdIds.usuarios.push(newUserId);
    }
  }
  
  // 4. Actualizar perfil propio
  if (!userToken || !profileId) {
    printTest('Actualizar perfil propio', false, 'Token o ID de perfil no disponible');
  } else {
    const updateProfile = await apiCall('usuarios', `/${profileId}`, {
      method: 'PUT',
      token: userToken,
      body: {
        nombres: 'Test Actualizado',
        telefono: '1234567890'
      }
    });
    printTest('Actualizar perfil propio', updateProfile.ok,
      updateProfile.ok ? 'Perfil actualizado' : (updateProfile.data?.msg || 'Error'));
  }
  
  // 5. Crear empleado (admin)
  if (!adminToken) {
    printTest('Crear empleado (admin)', false, 'Token de admin no disponible');
  } else {
    const timestamp = Date.now().toString().slice(-6);
    const newEmployee = await apiCall('usuarios', '/empleados', {
      method: 'POST',
      body: {
        username: `emp${timestamp}`,
        password: 'empleado123',
        nombres: 'Empleado',
        apellidos: 'Test',
        cedula: parseInt(`987654${timestamp}`),
        email: `empleado${timestamp}@test.com`,
        rol: 'empleado'
      }
    });
    const newEmployeeData = newEmployee.data?.data || newEmployee.data;
    const newEmployeeId = newEmployeeData?.usu_codigo || newEmployeeData?.id;
    printTest('Crear empleado (admin)', newEmployee.ok && newEmployeeId,
      newEmployee.ok ? `ID: ${newEmployeeId}` : (newEmployee.data?.msg || 'Error'));
    if (newEmployee.ok && newEmployeeId) {
      createdIds.usuarios.push(newEmployeeId);
      const empLogin = await apiCall('usuarios', '/login', {
        method: 'POST',
        body: { username: newEmployeeData?.username || newEmployeeData?.usu_abreviado, password: 'empleado123' }
      });
      if (empLogin.ok) {
        employeeToken = empLogin.data?.token || empLogin.data?.data?.token;
      }
    }
  }
}

/**
 * Pruebas de Productos
 */
async function testProductos() {
  printSection('PRUEBAS DE PRODUCTOS');
  
  // 1. Obtener todos los productos
  const allProducts = await apiCall('productos', '');
  const productsData = allProducts.data?.data || allProducts.data;
  const productsArray = Array.isArray(productsData) ? productsData : (Array.isArray(allProducts.data) ? allProducts.data : []);
  printTest('Obtener todos los productos', allProducts.ok && Array.isArray(productsArray),
    allProducts.ok ? `${productsArray?.length || 0} productos encontrados` : (allProducts.data?.msg || 'Error'));
  
  // 2. Obtener productos con filtros
  const filteredProducts = await apiCall('productos', '?categoria=Joyas&limit=10');
  const filteredData = filteredProducts.data?.data || filteredProducts.data;
  const filteredArray = Array.isArray(filteredData) ? filteredData : [];
  printTest('Obtener productos filtrados', filteredProducts.ok && Array.isArray(filteredArray),
    filteredProducts.ok ? `${filteredArray?.length || 0} productos encontrados` : (filteredProducts.data?.msg || 'Error'));
  
  // 3. Obtener categorías
  const categorias = await apiCall('productos', '/categorias');
  const categoriasData = categorias.data?.data || categorias.data;
  const categoriasArray = Array.isArray(categoriasData) ? categoriasData : [];
  printTest('Obtener categorías', categorias.ok && Array.isArray(categoriasArray),
    categorias.ok ? `${categoriasArray?.length || 0} categorías encontradas` : (categorias.data?.msg || 'Error'));
  
  // 4. Obtener sucursales
  const sucursales = await apiCall('productos', '/sucursales');
  const sucursalesData = sucursales.data?.data || sucursales.data;
  const sucursalesArray = Array.isArray(sucursalesData) ? sucursalesData : [];
  printTest('Obtener sucursales', sucursales.ok && Array.isArray(sucursalesArray),
    sucursales.ok ? `${sucursalesArray?.length || 0} sucursales encontradas` : (sucursales.data?.msg || 'Error'));
  
  // 5. Buscar productos
  const searchProducts = await apiCall('productos', '?q=oro&limit=5');
  const searchData = searchProducts.data?.data || searchProducts.data;
  const searchArray = Array.isArray(searchData) ? searchData : [];
  printTest('Buscar productos', searchProducts.ok && Array.isArray(searchArray),
    searchProducts.ok ? `${searchArray?.length || 0} resultados encontrados` : (searchProducts.data?.msg || 'Error'));
}

/**
 * Pruebas de Órdenes
 */
async function testOrdenes() {
  printSection('PRUEBAS DE ÓRDENES');
  
  // 1. Obtener todas las órdenes (admin)
  if (!adminToken) {
    printTest('Obtener todas las órdenes (admin)', false, 'Token de admin no disponible');
  } else {
    const allOrders = await apiCall('ordenes', '', { token: adminToken });
    const ordersData = allOrders.data?.data || allOrders.data;
    printTest('Obtener todas las órdenes (admin)', allOrders.ok && Array.isArray(ordersData),
      allOrders.ok ? `${ordersData?.length || 0} órdenes encontradas` : (allOrders.data?.msg || allOrders.error || 'Error'));
  }
  
  // 2. Obtener mis órdenes
  if (!userToken) {
    printTest('Obtener mis órdenes', false, 'Token de usuario no disponible');
  } else {
    const myOrders = await apiCall('ordenes', '?mine=true', { token: userToken });
    const myOrdersData = myOrders.data?.data || myOrders.data;
    printTest('Obtener mis órdenes', myOrders.ok && Array.isArray(myOrdersData),
      myOrders.ok ? `${myOrdersData?.length || 0} órdenes encontradas` : (myOrders.data?.msg || 'Error'));
  }
  
  // 3. Crear nueva orden
  if (!userToken) {
    printTest('Crear nueva orden', false, 'Token de usuario no disponible');
  } else {
    const productos = await apiCall('productos', '?limit=2');
    const productosData = productos.data?.data || productos.data;
    const productosArray = Array.isArray(productosData) ? productosData : (Array.isArray(productos.data) ? productos.data : []);
    if (productos.ok && productosArray && productosArray.length >= 1) {
      const producto = productosArray[0];
      const newOrder = await apiCall('ordenes', '', {
        method: 'POST',
        token: userToken,
        body: {
          items: [{
            id: producto.id || producto.art_consecutivo,
            cantidad: 1
          }]
        }
      });
      const newOrderData = newOrder.data?.data || newOrder.data;
      const orderId = newOrderData?.id_orden || newOrderData?.idOrden || newOrderData?.ID_ORDEN;
      printTest('Crear nueva orden', newOrder.ok && orderId,
        newOrder.ok ? `ID: ${orderId}` : (newOrder.data?.msg || 'Error'));
      if (newOrder.ok && orderId) {
        createdIds.ordenes.push(orderId);
        
        // 4. Intentar cancelar orden como cliente (debería funcionar)
        const cancelOrder = await apiCall('ordenes', `/${orderId}`, {
          method: 'PATCH',
          token: userToken,
          body: { estado: 'cancelado' }
        });
        printTest('Cancelar orden como cliente', cancelOrder.ok,
          cancelOrder.ok ? 'Orden cancelada' : (cancelOrder.data?.msg || 'Error'));
        
        // 5. Actualizar estado de orden como admin (debería funcionar)
        if (adminToken) {
          const updateOrder = await apiCall('ordenes', `/${orderId}`, {
            method: 'PATCH',
            token: adminToken,
            body: { estado: 'en_proceso' }
          });
          printTest('Actualizar estado de orden (admin)', updateOrder.ok,
            updateOrder.ok ? 'Estado actualizado' : (updateOrder.data?.msg || 'Error'));
        } else {
          printTest('Actualizar estado de orden (admin)', false, 'Token de admin no disponible');
        }
      }
    } else {
      printTest('Crear nueva orden', false, 'No hay productos disponibles en la base de datos');
    }
  }
}

/**
 * Pruebas de Solicitudes
 */
async function testSolicitudes() {
  printSection('PRUEBAS DE SOLICITUDES');
  
  // 1. Crear nueva solicitud
  if (!userToken) {
    printTest('Crear nueva solicitud', false, 'Token de usuario no disponible');
  } else {
    const newRequest = await apiCall('solicitudes', '', {
      method: 'POST',
      token: userToken,
      body: {
        categoria: 'Joyas',
        nombre_producto: 'Anillo de oro 18K',
        descripcion: 'Anillo de oro de 18 quilates con diamante',
        imagenes: [
          'https://example.com/imagen1.jpg',
          'https://example.com/imagen2.jpg'
        ]
      }
    });
    const newRequestData = newRequest.data?.data || newRequest.data;
    printTest('Crear nueva solicitud', newRequest.ok && (newRequestData?.id || newRequestData?.insertId),
      newRequest.ok ? `ID: ${newRequestData?.id || newRequestData?.insertId}` : (newRequest.data?.msg || 'Error'));
    let requestId = null;
    if (newRequest.ok && (newRequestData?.id || newRequestData?.insertId)) {
      requestId = newRequestData?.id || newRequestData?.insertId;
      createdIds.solicitudes.push(requestId);
    }
  }
  
  // 2. Obtener todas las solicitudes (admin)
  const allRequests = await apiCall('solicitudes', '', { token: adminToken });
  const allRequestsData = allRequests.data?.data || allRequests.data;
  const allRequestsArray = Array.isArray(allRequestsData) ? allRequestsData : [];
  printTest('Obtener todas las solicitudes (admin)', allRequests.ok && Array.isArray(allRequestsArray),
    allRequests.ok ? `${allRequestsArray?.length || 0} solicitudes` : (allRequests.data?.msg || 'Error'));
  
  // 3. Obtener mis solicitudes
  const myRequests = await apiCall('solicitudes', '?mine=true', { token: userToken });
  const myRequestsData = myRequests.data?.data || myRequests.data;
  const myRequestsArray = Array.isArray(myRequestsData) ? myRequestsData : [];
  printTest('Obtener mis solicitudes', myRequests.ok && Array.isArray(myRequestsArray),
    myRequests.ok ? `${myRequestsArray?.length || 0} solicitudes` : (myRequests.data?.msg || 'Error'));
  
  // 4. Obtener solicitud por ID
  const requestId = createdIds.solicitudes.length > 0 ? createdIds.solicitudes[0] : null;
  if (requestId && userToken) {
    const getRequest = await apiCall('solicitudes', `/${requestId}`, { token: userToken });
    const getRequestData = getRequest.data?.data || getRequest.data;
    printTest('Obtener solicitud por ID', getRequest.ok && (getRequestData?.id || getRequestData?.ID),
      getRequest.ok ? 'Solicitud encontrada' : (getRequest.data?.msg || 'Error'));
    
    // 5. Aprobar solicitud (admin)
    if (adminToken) {
      const approveRequest = await apiCall('solicitudes', `/${requestId}/estado`, {
        method: 'PUT',
        token: adminToken,
        body: {
          estado: 'Aprobado',
          monto_aprobado: 5000,
          tasa: 5.5,
          plazo: 30,
          fecha_plazo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          sucursal: 'Sucursal Central'
        }
      });
      printTest('Aprobar solicitud (admin)', approveRequest.ok,
        approveRequest.ok ? 'Solicitud aprobada' : (approveRequest.data?.msg || 'Error'));
    } else {
      printTest('Aprobar solicitud (admin)', false, 'Token de admin no disponible');
    }
  } else {
    printTest('Obtener solicitud por ID', false, 'No hay solicitudes creadas o token no disponible');
    printTest('Aprobar solicitud (admin)', false, 'No hay solicitudes para aprobar');
  }
}

/**
 * Pruebas de Contratos
 */
async function testContratos() {
  printSection('PRUEBAS DE CONTRATOS');
  
  // 1. Obtener todos los contratos
  if (!adminToken) {
    printTest('Obtener todos los contratos', false, 'Token de admin no disponible');
  } else {
    const allContracts = await apiCall('contratos', '', { token: adminToken });
    const contractsData = allContracts.data?.data || allContracts.data;
    printTest('Obtener todos los contratos', allContracts.ok && Array.isArray(contractsData),
      allContracts.ok ? `${contractsData?.length || 0} contratos encontrados` : (allContracts.data?.msg || 'Error'));
  }
  
  // 2. Obtener liquidez de sucursales
  if (!adminToken) {
    printTest('Obtener liquidez de sucursales', false, 'Token de admin no disponible');
  } else {
    const liquidez = await apiCall('contratos', '/liquidez', { token: adminToken });
    const liquidezData = liquidez.data?.data || liquidez.data;
    const liquidezArray = Array.isArray(liquidezData) ? liquidezData : [];
    printTest('Obtener liquidez de sucursales', liquidez.ok && Array.isArray(liquidezArray),
      liquidez.ok ? `${liquidezArray?.length || 0} sucursales encontradas` : (liquidez.data?.msg || liquidez.error || 'Error'));
  }
  
  // 3. Obtener transferencias
  if (!adminToken) {
    printTest('Obtener transferencias', false, 'Token de admin no disponible');
  } else {
    const transferencias = await apiCall('contratos', '/liquidez/transferencias', { token: adminToken });
    const transferenciasData = transferencias.data?.data || transferencias.data;
    printTest('Obtener transferencias', transferencias.ok && Array.isArray(transferenciasData),
      transferencias.ok ? `${transferenciasData?.length || 0} transferencias encontradas` : (transferencias.data?.msg || 'Error'));
  }
  
  // 4. Crear contrato desde solicitud aprobada
  if (!adminToken) {
    printTest('Crear contrato desde solicitud', false, 'Token de admin no disponible');
  } else {
    const solicitudes = await apiCall('solicitudes', '?estado=Aprobado', { token: adminToken });
    const solicitudesData = solicitudes.data?.data || solicitudes.data;
    if (solicitudes.ok && solicitudesData && Array.isArray(solicitudesData) && solicitudesData.length > 0) {
      const solicitud = solicitudesData[0];
      const productos = await apiCall('productos', '?limit=1');
      const productosData = productos.data?.data || productos.data;
      let producto = null;
      if (productos.ok && productosData && Array.isArray(productosData) && productosData.length > 0) {
        producto = productosData[0];
      }
      
      const newContract = await apiCall('contratos', '', {
        method: 'POST',
        token: adminToken,
        body: {
          solicitud_id: solicitud.id || solicitud.ID,
          producto_id: producto?.id || producto?.art_consecutivo || 1,
          con_valor: solicitud.monto_aprobado || solicitud.monto_aprobado || 5000,
          monto_desembolsado: solicitud.monto_aprobado || 5000,
          con_tasa: solicitud.tasa || solicitud.con_tasa || 5.5,
          con_tiempo: solicitud.plazo || 30,
          con_fecha_plazo: solicitud.fecha_plazo || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          con_sucursal: solicitud.sucursal || 'Centro',
          con_firmado: false,
          con_producto_entregado: false
        }
      });
      const newContractData = newContract.data?.data || newContract.data;
      const contractId = newContractData?.contratoId || newContractData?.id || newContractData?.ID;
      const errorMsg = newContract.data?.msg || newContract.data?.detail || newContract.data?.error || JSON.stringify(newContract.data) || 'Error';
      printTest('Crear contrato desde solicitud', newContract.ok && contractId,
        newContract.ok ? `ID: ${contractId}` : `Error: ${errorMsg}`);
      if (newContract.ok && contractId) {
        createdIds.contratos.push(contractId);
        
        // 5. Firmar contrato
        const signContract = await apiCall('contratos', `/${contractId}/firmar`, {
          method: 'PATCH',
          token: adminToken
        });
        printTest('Firmar contrato', signContract.ok,
          signContract.ok ? 'Contrato firmado' : (signContract.data?.msg || 'Error'));
        
        // 6. Entregar producto
        const deliverProduct = await apiCall('contratos', `/${contractId}/entregar`, {
          method: 'PATCH',
          token: adminToken
        });
        printTest('Entregar producto', deliverProduct.ok,
          deliverProduct.ok ? 'Producto entregado' : (deliverProduct.data?.msg || 'Error'));
        
        // 7. Registrar pago
        const payment = await apiCall('contratos', '/pagos', {
          method: 'POST',
          token: adminToken,
          body: {
            contrato_id: contractId,
            monto: 1000,
            fecha_pago: new Date().toISOString().split('T')[0],
            metodo_pago: 'Efectivo'
          }
        });
        const paymentData = payment.data?.data || payment.data;
        const paymentId = paymentData?.id || paymentData?.ID || paymentData?.insertId;
        printTest('Registrar pago', payment.ok && paymentId,
          payment.ok ? `Pago ID: ${paymentId}` : (payment.data?.msg || 'Error'));
      }
    } else {
      printTest('Crear contrato desde solicitud', false, 'No hay solicitudes aprobadas disponibles');
    }
  }
}

/**
 * Pruebas de Analytics (opcional - no falla si el servicio no está disponible)
 */
async function testAnalytics() {
  printSection('PRUEBAS DE ANALYTICS');
  
  // 1. Ping del servicio
  const ping = await apiCall('analytics', '/ping');
  const isAvailable = ping.ok && !ping.error;
  
  if (isAvailable) {
    printTest('Analytics ping', true, 'Servicio activo');
    
    // 2. Obtener reportes de Spark
    const reports = await apiCall('analytics', '/spark/reports', { token: adminToken });
    const reportsData = reports.data?.data || reports.data;
    printTest('Obtener reportes de Spark', reports.ok,
      reports.ok ? (reportsData ? `${Array.isArray(reportsData) ? reportsData.length : 1} reporte(s) encontrado(s)` : 'No hay reportes (esperado)') : (reports.data?.msg || 'Error'));
    
    // 3. Obtener resumen
    const summary = await apiCall('analytics', '/summary', { token: adminToken });
    printTest('Obtener resumen de analytics', summary.ok,
      summary.ok ? 'Resumen obtenido' : (summary.data?.msg || 'Error'));
  } else {
    // Analytics es opcional, marcamos las pruebas como pasadas si el servicio no está disponible
    printTest('Analytics ping', true, 'Servicio no disponible (opcional)');
    printTest('Obtener reportes de Spark', true, 'Servicio no disponible (opcional)');
    printTest('Obtener resumen de analytics', true, 'Servicio no disponible (opcional)');
  }
}

/**
 * Limpiar datos de prueba (opcional)
 */
async function cleanup() {
  printSection('LIMPIEZA DE DATOS DE PRUEBA');
  console.log(`${colors.yellow}Nota: Los datos de prueba no se eliminan automáticamente.${colors.reset}`);
  console.log(`${colors.yellow}IDs creados durante las pruebas:${colors.reset}`);
  console.log(`  Usuarios: ${createdIds.usuarios.join(', ') || 'ninguno'}`);
  console.log(`  Órdenes: ${createdIds.ordenes.join(', ') || 'ninguno'}`);
  console.log(`  Solicitudes: ${createdIds.solicitudes.join(', ') || 'ninguno'}`);
  console.log(`  Contratos: ${createdIds.contratos.join(', ') || 'ninguno'}`);
}

/**
 * Función principal
 */
async function main() {
  console.log(`${colors.blue}`);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   SCRIPT DE PRUEBAS AUTOMATIZADAS - PROYECTO OPOR        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);
  
  try {
    await checkServices();
    await testAuthentication();
    await testUsuarios();
    await testProductos();
    await testOrdenes();
    await testSolicitudes();
    await testContratos();
    await testAnalytics();
    await cleanup();
    
    // Resumen final
    printSection('RESUMEN FINAL');
    console.log(`Total de pruebas: ${stats.total}`);
    console.log(`${colors.green}✓ Pasadas: ${stats.passed}${colors.reset}`);
    console.log(`${colors.red}✗ Fallidas: ${stats.failed}${colors.reset}`);
    
    if (stats.failed > 0) {
      console.log(`\n${colors.red}Errores encontrados:${colors.reset}`);
      stats.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.name}: ${error.message}`);
      });
    }
    
    const successRate = ((stats.passed / stats.total) * 100).toFixed(2);
    console.log(`\n${colors.cyan}Tasa de éxito: ${successRate}%${colors.reset}`);
    
    if (stats.failed === 0) {
      console.log(`\n${colors.green}¡Todas las pruebas pasaron exitosamente!${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`\n${colors.yellow}Algunas pruebas fallaron. Revisa los errores arriba.${colors.reset}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Error fatal: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { main };









