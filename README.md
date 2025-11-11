# Proyecto Opor

Aplicación web de compraventa y préstamos basada en arquitectura de microservicios. Incluye gestión de usuarios, productos, órdenes, solicitudes de préstamo, contratos, pagos y liquidez por sucursal.

##  Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
npm run install:all
```

### 2. Configurar bases de datos
```bash
mysql -u root -p < troncal00.sql
mysql -u root -p < troncal01.sql
mysql -u root -p < db/base11.sql
mysql -u root -p < db/migrations/20251107_add_usuarios_detalle.sql
mysql -u root -p < db/migrations/20251107_add_prestamos_tables.sql
mysql -u root -p < db/migrations/20251107_add_pagos_to_base20.sql
```

### 3. Configurar variables de entorno
```bash
npm run setup
```
Edita los archivos `.env` en cada microservicio con tus credenciales de MySQL.

### 4. Crear usuarios de prueba
```bash
npm run crear-usuarios
```

### 5. Iniciar servicios
```bash
npm run start:all
npm run frontend
```

Accede a: `http://localhost:8080`

### Credenciales de prueba
- **Admin**: `admin` / `admin123` (Cédula: 2000000000)
- **Empleado**: `employee` / `employee123` (Cédula: 3000000000)
- **Cliente**: `testuser` / `test123` (Cédula: 1000000000)

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

## Puertos y endpoints

- **Frontend**: http://localhost:8080
- **Usuarios**: http://localhost:3001/api/usuarios
- **Productos**: http://localhost:3002/api/productos
- **Órdenes**: http://localhost:3003/api/ordenes
- **Solicitudes**: http://localhost:3004/api/solicitudes
- **Contratos**: http://localhost:3005/api/contratos
- **Analytics**: http://localhost:3006/api/analytics

Para usar IP LAN, actualiza `frontend/assets/js/api.js`.

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

## Instalación Rápida

### 1. Instalar dependencias del proyecto raíz
```bash
npm install
```

### 2. Instalar dependencias de todos los microservicios
```bash
npm run install:all
```

O instalar individualmente:
```bash
npm run install:usuarios
npm run install:productos
npm run install:ordenes
npm run install:solicitudes
npm run install:contratos
```

### 3. Configurar variables de entorno
Ejecuta el script de configuración automática:
```bash
npm run setup
```

Esto creará archivos `.env` desde `.env.example` en cada microservicio. Luego edita cada `.env` con tus credenciales de MySQL:

**Microservicios/Usuarios/.env:**
```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_password
DB_NAME=base10
JWT_SECRET=tu_secreto_superseguro_cambiar_en_produccion
```

**Microservicios/Productos/.env:**
```env
PORT=3002
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_password
DB_NAME=base20
JWT_SECRET=tu_secreto_superseguro_cambiar_en_produccion
```

**Microservicios/Ordenes/.env:**
```env
PORT=3003
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_password
DB_NAME=base11
JWT_SECRET=tu_secreto_superseguro_cambiar_en_produccion
USUARIOS_URL=http://localhost:3001/api/usuarios
PRODUCTOS_URL=http://localhost:3002/api/productos
```

**Microservicios/Solicitudes/.env:**
```env
PORT=3004
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_password
DB_NAME=base11
JWT_SECRET=tu_secreto_superseguro_cambiar_en_produccion
CONTRACTS_URL=http://localhost:3005
```

**Microservicios/Contratos/.env:**
```env
PORT=3005
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_password
DB_NAME=base20
JWT_SECRET=tu_secreto_superseguro_cambiar_en_produccion
SOLICITUDES_URL=http://localhost:3004
PRODUCTOS_URL=http://localhost:3002/api/productos
```

### 4. Configurar bases de datos MySQL

Ejecuta los scripts SQL para crear las bases de datos:

```bash
# base10 (para Usuarios) - desde troncal00.sql
mysql -u root -p < troncal00.sql

# base20 (para Productos y Contratos) - desde troncal01.sql
mysql -u root -p < troncal01.sql

# base11 (para Ordenes y Solicitudes) - desde db/base11.sql
mysql -u root -p < db/base11.sql

# tabla de detalle de usuarios (email, preferencias)
mysql -u root -p < db/migrations/20251107_add_usuarios_detalle.sql
```

O ejecuta los scripts manualmente en tu cliente MySQL.

**Bases de datos:**
- `base10` - Usuarios (tabla: `usuarios`) y detalles de perfil (`usuarios_detalle`)
- `base20` - Productos (tabla: `articulos`) y Contratos (tabla: `contrato`)
- `base11` - Ordenes (tabla: `ordenes`) y Solicitudes (tabla: `solicitudes`)

## Ejecución

### Opción 1: Iniciar todos los microservicios a la vez (recomendado)
```bash
npm run start:all
```

### Opción 2: Iniciar microservicios individualmente
```bash
npm run start:usuarios
npm run start:productos
npm run start:ordenes
npm run start:solicitudes
npm run start:contratos
```

### Opción 3: Modo desarrollo con nodemon (auto-reload)
```bash
npm run dev:all
```

### Iniciar el frontend
```bash
npm run frontend
```

Luego abre en tu navegador: `http://localhost:8080`

**Alternativa:** Si prefieres usar Apache/XAMPP, copia `frontend/` a `htdocs` y abre `http://localhost/frontend/public/index.html`.

## Autenticación y roles
- Login: `POST /api/usuarios/login` con `{ username, password }` → `{ ok, data: { token, user } }`.
- En requests, encabezado `Authorization: Bearer <JWT>`.
- Roles soportados: `cliente`, `empleado`, `admin`. Los tokens incluyen datos del perfil y preferencias para el frontend.
- Guards de rutas en `assets/js/auth.js`; puedes pasar un rol o un arreglo de roles permitidos a `requireAuth()`.

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

Empleado:
- Panel operativo (accesos rápidos)
- Órdenes (lista, búsqueda/paginación, cambio de estado)
- Solicitudes (consulta y seguimiento)
- Contratos (consulta de vigentes y vencidos)

## Endpoints clave admin
- Órdenes: `PATCH /api/ordenes/:id` → `{ status|estado }`
- Solicitudes: `PUT /api/solicitudes/:id/estado` → `{ estado }` + si Aprobado: `{ monto_aprobado, con_tasa, plazo?, fecha_plazo?, sucursal? }`
- Contratos:
  - `PATCH /api/contratos/:id/estado` → `{ nuevoEstado }`
  - `PATCH /api/contratos/:id/firmar`
  - `PATCH /api/contratos/:id/entregar`
  - `PATCH /api/contratos/:id/desembolsar` → `{ monto }`

## Utilidades

### Reclasificación de Productos

Para reorganizar productos mal categorizados en la base de datos:

```bash
# 1. Instalar dependencias Python
pip install -r scripts/requirements-reclasificar.txt

# 2. Analizar (sin aplicar cambios)
npm run reclasificar:analizar

# 3. Revisar el reporte en scripts/reporte_reclasificacion.json

# 4. Aplicar cambios (si estás satisfecho)
npm run reclasificar:aplicar
```

El script analiza las descripciones de productos usando palabras clave y heurísticas para asignar la categoría correcta (Joyas, Mercancía, Vehículos).

### Pruebas automatizadas
```bash
npm run test:all
```

Ejecuta pruebas end-to-end de todos los microservicios y funcionalidades principales.

## Contribución
1) Branch: `git checkout -b feature/nombre`
2) Commit: `git commit -m "feat: ..."`
3) Push: `git push origin feature/nombre`
4) PR en GitHub

