// cart.js - Gestión del carrito de compras
// Almacena el carrito en localStorage

const CART_KEY = 'opor_cart';

export function getCart() {
  try {
    const cart = localStorage.getItem(CART_KEY);
    return cart ? JSON.parse(cart) : [];
  } catch {
    return [];
  }
}

export function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      nombre: product.nombre || product.name,
      precio: product.precio || product.price || 0,
      cantidad: 1,
      imagen: product.imagen || product.image
    });
  }
  
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  return cart;
}

export function removeFromCart(productId) {
  const cart = getCart().filter(item => item.id !== productId);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  return cart;
}

export function updateQuantity(productId, quantity) {
  const cart = getCart();
  const item = cart.find(item => item.id === productId);
  
  if (item) {
    if (quantity <= 0) {
      return removeFromCart(productId);
    }
    item.quantity = quantity;
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }
  
  return cart;
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
}

export function computeTotals(items) {
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.precio || item.price || 0) * Number(item.quantity || 1));
  }, 0);
  
  // Simular impuestos y envío (10% impuestos, $5000 envío)
  const impuestos = subtotal * 0.1;
  const envio = 5000;
  const total = subtotal + impuestos + envio;
  
  return { subtotal, impuestos, envio, total };
}

export function getCartCount() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
}
