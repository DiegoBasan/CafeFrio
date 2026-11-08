# Café Frío · Caja

Punto de venta para la combi de Café Frío: cobro rápido con fotos, tickets con logo para compartir, historial de ventas, menú con inventario, números del negocio y conciliación con reportes de Mercado Pago.

Es una página web estática (HTML, CSS y JS, sin compilación) que se instala como app en el iPhone.

## Instalar en el iPhone
1. Abre la URL de la app en **Safari**.
2. Toca **Compartir → Agregar a inicio**.
3. Ábrela desde el ícono del pingüino: corre a pantalla completa y funciona sin internet.

## Cómo se usa
- **Caja:** toca un producto para sumarlo a la orden; **mantén presionado** para quitarlo. Arriba a la derecha: escanear código, buscar y ver solo destacados.
- **Cobro:** Efectivo (con cambio), Mercado Pago o Transferencia. Al cobrar se genera el ticket y **Compartir ticket** abre el menú de compartir del teléfono.
- **Menú:** productos con foto, precio, costo, inventario, código de barras y destacados. Ahí mismo se personaliza el ticket y se hacen respaldos.

## Datos
Las ventas se guardan en el teléfono donde se usa la app (IndexedDB). En **Menú → Datos y respaldo** se puede crear y restaurar un respaldo, o exportar las ventas a CSV.

## Archivos
- `index.html`: estructura, íconos y logo vectorizado
- `app.css`: estilos (grises con acento vino)
- `app.js`: lógica de la app
- `sw.js`: funcionamiento sin internet
- `manifest.webmanifest`, `icons/`: instalación como app
- `img/`: fotos de los productos
