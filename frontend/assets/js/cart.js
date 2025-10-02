const CART_KEY = 'cart_items';

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToCart(product, quantity = 1) {
  const items = getCart();
  const idx = items.findIndex(i => i.id === product.id);
  if (idx >= 0) items[idx].quantity += quantity; else items.push({ ...product, quantity });
  saveCart(items);
}

export function updateQuantity(productId, quantity) {
  const items = getCart();
  const idx = items.findIndex(i => i.id === productId);
  if (idx >= 0) {
    items[idx].quantity = quantity;
    if (items[idx].quantity <= 0) items.splice(idx,1);
  }
  saveCart(items);
}

export function clearCart() {
  saveCart([]);
}

export function computeTotals(items) {
  const subtotal = items.reduce((sum, i) => sum + (Number(i.precio ?? i.price) * i.quantity), 0);
  const total = subtotal; // extend with taxes/shipping if needed
  return { subtotal, total };
}

