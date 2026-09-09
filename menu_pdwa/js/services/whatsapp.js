export function sendOrderToWhatsApp(phoneNumber, orderData) {
  const { type, details, cartItems, total, notes } = orderData;

  let text = `🛒 *NUEVO PEDIDO*\n`;
  text += `----------------------------------\n`;
  text += `📍 *Modalidad:* ${type.toUpperCase()}\n`;

  if (type === 'mesa') {
    text += `🪑 *Mesa:* #${details.tableNumber}\n`;
  } else if (type === 'delivery') {
    text += `🏠 *Dirección:* ${details.address}\n`;
    if (details.mapsUrl) text += `🗺️ *Ubicación:* ${details.mapsUrl}\n`;
  } else if (type === 'pickup') {
    text += `👤 *Cliente:* ${details.clientName}\n`;
  }

  text += `----------------------------------\n`;
  text += `📋 *DETALLE:* \n`;

  cartItems.forEach(item => {
    text += `▫️ 1x ${item.name}`;
    if (item.details) text += ` (${item.details})`;
    text += ` - $${item.price.toFixed(2)}\n`;
  });

  text += `----------------------------------\n`;
  if (notes) text += `📝 *Notas:* ${notes}\n`;
  text += `💰 *TOTAL:* $${total.toFixed(2)}`;

  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedText}`;

  window.open(whatsappUrl, '_blank');
}