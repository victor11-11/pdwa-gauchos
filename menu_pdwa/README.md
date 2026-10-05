# Menú Digital PWA

Sistema de pedidos e impresión para restaurantes. Corre en Node.js, guarda en
SQLite y no depende de ningún servicio de pago ni de ninguna nube.

Lo que hace: toma pedidos, manda la comanda a la impresora de la cocina, cobra y
da la cuenta, y aplica la tasa del BCV del día al ticket.

---

## Qué necesita

| | |
|---|---|
| Node.js | 20 o superior |
| Sistema | Linux o macOS (Windows funciona con límites, ver más abajo) |
| Base de datos | SQLite, incluida. No hay que instalar nada aparte |
| Impresora | Térmica de tickets de 80 mm o 58 mm por USB, o de red |

No hace falta base de datos externa, ni servidor de impresión, ni cuenta de
servicio.

---

## Puesta en marcha

```bash
npm install
npm start
```

Queda escuchando en `http://localhost:3000`. El menú está en `/` y el panel de
administración en `/admin`.

En Render (o cualquier hosting) lo mismo, pero con `PORT` definida: el servidor
ya la lee.

En Render, la instancia puede reiniciarse y su sistema de archivos normal es
temporal. Para conservar la tasa entre despliegues, crea un Persistent Disk
montado en `/var/data` y define `RATE_FILE_PATH=/var/data/tasas.json` en las
variables de entorno. Sin disco persistente, el servidor vuelve a descargar la
tasa al arrancar, pero el archivo no conserva cambios entre reinicios.

---

## Impresoras

Lo importante: **no hay que escribir el nombre de la impresora en el código.**
El sistema la busca, la reconoce y usa la que esté funcionando. Hay dos formas
de tenerla: en el mismo equipo que el servidor, o en otro.

### Opción A — la impresora está en el mismo equipo (la normal)

1. Conectar la impresora por USB y encenderla.
2. Ver si el sistema la detectó:

   ```bash
   npm run printer
   ```

   Esto lista lo que hay: las impresoras detectadas, a qué rol corresponde cada
   una y si están conectadas de verdad. Si algo no cuadra, lo dice con
   palabras, no con un código.

3. Crear la cola de impresión, si aún no existe:

   ```bash
   npm run printer -- aprovisionar 09090FC17471
   ```

   El número es el **serial** del equipo, que aparece en el paso anterior. Con
   esto ya imprime sola, sin configurar nada más.

4. Probar:

   ```bash
   npm run printer -- probar
   ```

### Opción B — la impresora está en otro equipo

El servidor está en la nube (por ejemplo Render) y la ticketera en el local del
restaurante. En ese caso corre el **agente de impresión** en el equipo de la
impresora:

```bash
SOCKET_URL=https://tu-servidor.onrender.com AGENT_TOKEN=<secreto> npm run agente
```

El secreto lo imprime el servidor al arrancar:

```
🔑 Secreto del agente (ponlo en AGENT_TOKEN del equipo de las impresoras):
   817d83cd...
```

El agente se queda en primer plano y avisa de qué tiene:

```
[POS] Conectado al servidor. Listo para recibir impresiones.
[POS] Inventario local:
[POS]   Cocina: Printer_POS-80
[POS]   Caja: Printer_POS-80
```

Desde el panel de administración se ve si el agente está conectado, qué
impresoras tiene y si la última comanda salió en papel.

El agente también se puede dejar corriendo para siempre:

```bash
npm install -g pm2
pm2 start impresor_local.js --name impresor --env SOCKET_URL=https://tu-servidor.onrender.com
pm2 save
```

En Render define `AGENT_TOKEN` como una variable de entorno estable y configura
el mismo valor en el equipo local que ejecuta el agente. No dependas del token
generado automáticamente: el archivo local de Render puede desaparecer al
reiniciar o desplegar, y entonces el agente deja de autenticarse.

### Permiso para crear impresoras

Crear una cola en CUPS sin `sudo` necesita estar en el grupo `lp`:

```bash
sudo usermod -aG lp $USER
```

Hay que **cerrar la sesión y volver a entrar** para que el grupo se aplique.
Mientras tanto, si se crea la cola con `sudo lpadmin` a mano, todo lo demás
funciona igual.

---

## Los roles: cocina y caja

El sistema no sabe qué son las impresoras, sabe **para qué** se imprimen:

- **Cocina**: la comanda del pedido.
- **Caja**: la cuenta cuando el cliente paga.

Cada rol se asigna a una impresora desde el panel
(*Administración → Impresoras*), o desde la consola:

```bash
npm run printer -- enlazar kitchen MI_COLA
npm run printer -- desenlazar kitchen
```

Opcionalmente, si un equipo tiene una sola impresora para todo, se fija por
entorno y no hay que tocar nada más:

```bash
PRINTER_NAME=MI_COLA npm start
```

`PRINTER_NAME` es un atajo para el caso de una sola impresora. Si hay varias,
el sistema elige solo, y el panel deja ver cuál eligió y por qué.

### Por qué esto no se rompe solo

Un detalle que costó trabajo: **CUPS acepta un trabajo para una impresora
apagada y lo guarda para siempre.** El sistema dice "impreso" y el papel nunca
sale.

Por eso la detección no se fija en el nombre de la cola (que CUPS pone por
comodidad y puede repetir en equipos distintos) sino en el **número de serie del
equipo**, y comprueba en cada impresión que siga conectado. Si no lo está, avisa
y usa otra, en vez de perder la comanda.

En el panel, cada rol muestra de dónde salió la impresora elegida y si hay algo
que mirar.

---

## Cuando no sale papel

```bash
npm run printer
```

Es el primer paso y responde casi todo. Lo que suele ser:

| Lo que dice | Qué hacer |
|---|---|
| "CUPS no está instalado" | Instalar CUPS: `sudo apt install cups` |
| "Equipo presente, sin cola" | `npm run printer -- aprovisionar <serial>` |
| "Equipo no conectado" | Cambiar el cable USB, o probar otro puerto. Es lo más común |
| "El dispositivo no está conectado" | El rol apunta a una impresora desenchufada: se enlaza a otra desde el panel |
| "Dos colas apuntan al mismo equipo" | Sobra una de las dos. Solo una puede imprimir |
| "No parece una impresora de tickets" | Es una impresora normal (tinta o láser). El sistema no le manda ESC/POS porque saldría como caracteres raros |

El panel tiene además **Prueba de impresión** y **Limpiar trabajos atascados**.

---

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `BUSINESS_NAME` | Nombre que sale impreso en los tickets | `Gauchos` |
| `PRINTER_NAME` | Fuerza una impresora (solo si hay una) | autodetección |
| `AGENT_TOKEN` | Secreto entre servidor y agente | se genera solo |
| `RATE_FILE_PATH` | Ruta del archivo de tasas; usar una ruta dentro del Persistent Disk en Render | `tasas.json` del proyecto |
| `SOCKET_URL` | Dirección del servidor, para el agente | Render |
| `PRINTER_LOG_TAG` | Cómo se llama el agente en los logs | `POS` |

`BUSINESS_NAME` conviene ponerlo siempre que no sea el nombre de este
restaurante: es lo que sale impreso arriba de cada ticket.

---

## Límites conocidos

- **Windows**: el panel funciona y se ven las impresoras del sistema, pero
  mandar ESC/POS crudo a una impresora de red no es fiable. En Windows lo
  probado es usar la impresora por USB o por red con su driver instalado.
- **El historial de trabajos** se guarda en memoria y en SQLite. En Render el
  SQLite es temporal, así que el historial se reinicia al reiniciar el servicio.
- **`database.sqlite` sí está en el repositorio**, con los datos de este local.
  Para un cliente hay que decidir si se sube o se crea vacío.

---

## Comandos

```bash
npm start                    # arranca el servidor
npm run printer              # diagnóstico de impresoras
npm run printer -- listar    # solo el listado
npm run printer -- probar    # prueba de impresión
npm run printer -- cola NOMBRE   # estado de una cola
npm run printer -- trabajos     # últimos trabajos
npm run printer -- limpiar      # despeja trabajos atascados
npm run agente               # agente de impresión local
```
