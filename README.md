# Proyecto Opor

Aplicación web de compraventa basada en arquitectura de microservicios (Usuarios, Productos, Órdenes, Solicitudes, Contratos) + frontend estático. Autenticación con JWT, comunicación REST, y MySQL como base de datos.

## Estructura del proyecto
```
Proyecto Opor/
├─ Microservicios/
│  ├─ Usuarios/
│  ├─ Productos/
│  ├─ Ordenes/
│  ├─ Solicitudes/
│  └─ Contratos/
│     └─ (cada servicio: index.js, package.json, src/{controllers,models,db,auth|middleware})
├─ frontend/
│  ├─ public/ (HTML por página: cliente y admin)
│  └─ assets/
│     ├─ css/ (base.css, layout.css, components.css, theme.css)
│     ├─ js/  (api.js, auth.js, ui.js, cart.js, ... y admin/*)
│     └─ img/ (logo.svg)
├─ db/ (scripts SQL si aplica)
├─ docs/
└─ README.md
```

## Tecnologías
- Backend: Node.js, Express, MySQL (mysql2), JWT, CORS, morgan, axios, bcrypt
- Frontend: HTML5, CSS3, JavaScript (ES Modules, MPA)

## Puertos y endpoints (por defecto)
- Usuarios: http://localhost:3001/api/usuarios
- Productos: http://localhost:3002/api/productos
- Órdenes: http://localhost:3003/api/ordenes
- Solicitudes: http://localhost:3004/api/solicitudes
- Contratos: http://localhost:3005/api/contratos

Para usar IP LAN (por ejemplo `http://192.168.100.2`), actualiza `frontend/assets/js/api.js`.

## Requisitos
- Node.js v18+
- MySQL/MariaDB
- Git
- (Opcional) XAMPP/Apache para servir el frontend como estático

## Configuración de entorno
Crea un `.env` por microservicio con variables típicas:
```
PORT=300X
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=tu_bd
JWT_SECRET=tu_secreto_superseguro
# Si un servicio llama a otro:
USUARIOS_URL=http://localhost:3001/api/usuarios
PRODUCTOS_URL=http://localhost:3002/api/productos
SOLICITUDES_URL=http://localhost:3004
CONTRACTS_URL=http://localhost:3005
```

## Instalación
1. Clonar repositorio
```
git clone https://github.com/tu-usuario/proyecto-opor.git
cd proyecto-opor
```
2. Instalar dependencias (microservicios)
```
cd Microservicios/Usuarios && npm install
cd ../Productos && npm install
cd ../Ordenes && npm install
cd ../Solicitudes && npm install
cd ../Contratos && npm install
```
3. Configurar BD
- Crea las bases y ejecuta scripts de `db/` si aplica.

## Ejecución (dev)
1) Levantar microservicios (terminales separadas)
```
cd Microservicios/Usuarios && node index.js
cd ../Productos && node index.js
cd ../Ordenes && node index.js
cd ../Solicitudes && node index.js
cd ../Contratos && node index.js
```
2) Levantar frontend
- Apache/XAMPP: copia `frontend/` a `htdocs` y abre `http://localhost/frontend/public/index.html`.
- Servidor estático local: servir `frontend/public/`.

## Autenticación y roles
- Login: `POST /api/usuarios/login` con `{ username, password }` → `{ ok, token }`.
- En requests, encabezado `Authorization: Bearer <JWT>`.
- Guards de cliente/admin en `assets/js/auth.js`.

## Frontend (páginas)
Cliente:
- Productos (lista, detalle, carrito, checkout)
- Órdenes (lista y detalle)
- Solicitudes (crear/ver; nombre, descripción, categoría, imágenes)
- Contratos (lista con estado/fecha/plazo/usuario; detalle con monto/firmado/entregado)
- Perfil (nombres, apellidos, teléfono, dirección, contraseña)

Admin:
- Dashboard (conteos básicos)
- Usuarios (lista, búsqueda/paginación, detalle)
- Productos (lista, búsqueda/paginación, crear/editar)
- Órdenes (lista, búsqueda/paginación, detalle, cambio de estado)
- Solicitudes (lista, búsqueda/paginación, detalle; aprobar con monto/tasa/plazo/fecha_plazo/sucursal)
- Contratos (lista, búsqueda/paginación, detalle; cambiar estado, firmar, entregar, desembolsar)

## Endpoints clave admin
- Órdenes: `PATCH /api/ordenes/:id` → `{ status|estado }`
- Solicitudes: `PUT /api/solicitudes/:id/estado` → `{ estado }` + si Aprobado: `{ monto_aprobado, con_tasa, plazo?, fecha_plazo?, sucursal? }`
- Contratos:
  - `PATCH /api/contratos/:id/estado` → `{ nuevoEstado }`
  - `PATCH /api/contratos/:id/firmar`
  - `PATCH /api/contratos/:id/entregar`
  - `PATCH /api/contratos/:id/desembolsar` → `{ monto }`

## Contribución
1) Branch: `git checkout -b feature/nombre`
2) Commit: `git commit -m "feat: ..."`
3) Push: `git push origin feature/nombre`
4) PR en GitHub

