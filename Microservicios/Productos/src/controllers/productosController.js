// controllers/productosController.js
const express = require('express');
const router = express.Router();
const productosModel = require('../models/productosModel');
const { authenticateJWT } = require('../middleware/auth'); // ruta unificada

// Helpers
function isPositiveNumber(v) {
  if (v === undefined || v === null || v === '') return false;
  const n = Number(v);
  return !Number.isNaN(n) && n >= 0;
}

// Ping
router.get('/ping', (req, res) => res.json({ ok: true, msg: 'Microservicio de Productos funcionando ✅' }));

// POST /productos -> crear producto
// Nota: Contratos puede POST sin token si lo configuras así. Aquí por seguridad dejamos auth opcional comentada.
router.post('/', /* authenticateJWT, */ async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.nombre && !body.descripcion) {
      return res.status(400).json({ ok: false, msg: 'Debe enviar al menos nombre o descripcion' });
    }

    // Mapear categoría a clase (1=Joyas, 2=Mercancía, 3=Vehículos)
    const categoriaMap = {
      'Joyas': 1,
      'Mercancía': 2,
      'Mercancia': 2,
      'Vehículos': 3,
      'Vehiculos': 3
    };
    const categoria = body.categoria || body.cat || 'Sin categoria';
    const clase = categoriaMap[categoria] || 1; // Default a Joyas si no se encuentra
    
    const payload = {
      nombre: body.nombre || body.title || 'Producto desde contrato',
      descripcion: body.descripcion || body.desc || '',
      categoria: categoria,
      clase: clase, // Agregar clase mapeada
      precio: isPositiveNumber(body.precio) ? Number(body.precio) : 0,
      cantidad: Number.isInteger(Number(body.cantidad || body.stock)) ? Number(body.cantidad || body.stock) : 1,
      estado: body.estado || 'garantia',
      imagenes: Array.isArray(body.imagenes) ? body.imagenes : (body.imagenes ? [body.imagenes] : []),
      sucursal: body.sucursal || null,
      tipo: body.tipo || 1, // Agregar tipo por defecto
      lugar: body.lugar || body.sucursal || 1, // Agregar lugar por defecto
      metadata: body.metadata || null
    };

    const created = await productosModel.createProduct(payload);
    return res.status(201).json({
      ok: true,
      msg: 'Producto creado correctamente',
      data: { id: created.insertId, ...payload }
    });
  } catch (err) {
    console.error('Error POST /productos', err);
    res.status(500).json({ ok: false, msg: 'Error creando producto', error: err.message });
  }
});

// GET /productos -> listar (filtros por query)
router.get('/', async (req, res) => {
  try {
    const filters = {
      categoria: req.query.categoria,
      estado: req.query.estado,
      sucursal: req.query.sucursal,
      sin_precio: req.query.sin_precio,
      precio_min: req.query.precio_min,
      precio_max: req.query.precio_max,
      q: req.query.q
    };
    const rows = await productosModel.getProducts(filters);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('Error GET /productos', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo productos', error: err.message });
  }
});

// GET /productos/categorias -> obtener categorías disponibles
router.get('/categorias', async (req, res) => {
  try {
    const categorias = await productosModel.getCategorias();
    res.json({ ok: true, data: categorias });
  } catch (err) {
    console.error('Error GET /productos/categorias', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo categorías', error: err.message });
  }
});

// GET /productos/sucursales -> obtener sucursales disponibles
router.get('/sucursales', async (req, res) => {
  try {
    const sucursales = await productosModel.getSucursales();
    res.json({ ok: true, data: sucursales });
  } catch (err) {
    console.error('Error GET /productos/sucursales', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo sucursales', error: err.message });
  }
});

// GET /productos/:id -> detalle (normalizado para ordenes)
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const producto = await productosModel.getProductById(id);
    if (!producto) return res.status(404).json({ ok: false, msg: 'Producto no encontrado' });
    const result = {
      id: producto.id,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      categoria: producto.categoria,
      precio: Number(producto.precio || 0),
      cantidad: Number(producto.cantidad || 0),
      estado: producto.estado,
      imagenes: producto.imagenes,
      sucursal: producto.sucursal,
      metadata: producto.metadata
    };
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error('Error GET /productos/:id', err);
    res.status(500).json({ ok: false, msg: 'Error obteniendo producto', error: err.message });
  }
});

// PUT /productos/:id -> actualizar producto (requires auth)
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const allowed = ['nombre','descripcion','categoria','precio','cantidad','estado','imagenes','sucursal','metadata'];
    const update = {};
    for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

    if (Object.keys(update).length === 0) return res.status(400).json({ ok: false, msg: 'Nada para actualizar' });

    const updated = await productosModel.updateProduct(id, update);
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Producto no encontrado' });

    res.json({ ok: true, msg: 'Producto actualizado correctamente' });
  } catch (err) {
    console.error('Error PUT /productos/:id', err);
    res.status(500).json({ ok: false, msg: 'Error actualizando producto', error: err.message });
  }
});

// PATCH /productos/:id/estado -> cambiar estado (garantia / a_venta)
router.patch('/:id/estado', authenticateJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const nuevoEstado = req.body.estado;
    if (!nuevoEstado) return res.status(400).json({ ok: false, msg: 'Debe enviar estado' });
    const updated = await productosModel.updateProduct(id, { estado: nuevoEstado });
    if (updated.affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Producto no encontrado' });
    res.json({ ok: true, msg: 'Estado actualizado', data: { id, estado: nuevoEstado } });
  } catch (err) {
    console.error('Error PATCH /productos/:id/estado', err);
    res.status(500).json({ ok: false, msg: 'Error actualizando estado', error: err.message });
  }
});

// PATCH /productos/:id/cantidad -> actualizar cantidad disponible (útil para ordenes)
router.patch('/:id/cantidad', authenticateJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const cantidad = req.body.cantidad;
    if (cantidad === undefined || isNaN(Number(cantidad))) return res.status(400).json({ ok:false, msg: 'cantidad inválida' });
    const updated = await productosModel.updateProduct(id, { cantidad: Number(cantidad) });
    if (updated.affectedRows === 0) return res.status(404).json({ ok:false, msg:'Producto no encontrado' });
    res.json({ ok:true, msg:'Cantidad actualizada', data: { id, cantidad: Number(cantidad) } });
  } catch (err) {
    console.error('Error PATCH /productos/:id/cantidad', err);
    res.status(500).json({ ok:false, msg:'Error actualizando cantidad', error: err.message });
  }
});

// DELETE /productos/:id -> eliminar (requires auth)
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await productosModel.deleteProduct(id);
    if (deleted.affectedRows === 0) return res.status(404).json({ ok:false, msg:'Producto no encontrado' });
    res.json({ ok:true, msg:'Producto eliminado correctamente', id });
  } catch (err) {
    console.error('Error DELETE /productos/:id', err);
    res.status(500).json({ ok:false, msg:'Error eliminando producto', error: err.message });
  }
});

module.exports = router;
