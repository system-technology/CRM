# 2026-11-20 — Propuesta al viajero (auditoría UX, punto 8 / I3)

Rama `b/T-000-propuesta-al-viajero`. Carril `b/` (solo `apps/web`). En paralelo, otra sesión trabaja
los puntos 3 y 7 de la auditoría (PR #308). Este cambio no toca ninguno de sus archivos.

## Qué se pidió

La cotización imprimible (`/cotizaciones/[id]/imprimir`) parecía una factura: una tabla de precios,
sin itinerario, sin lo que incluye y sin RNT. Es la pieza que el viajero reenvía a su familia por
WhatsApp, y es donde Travefy y Tern ganan (auditoría UX 2026-11-20 §3 e I3).

## Plan de diseño (skills `diseno-web` §1 y `frontend-design`, antes del código)

- **Para quién:** el viajero, que la recibe en PDF. Su decisión es aceptar el viaje. La asesora solo
  imprime (la barra de arriba no se imprime).
- **Dato que manda:** destino, salida y regreso, duración, viajeros, total y vigencia del precio.
- **Pieza memorable:** la portada es un **pase de abordar**: fondo `oceano-900`, filete
  `dorado-500` (el acento de marca), y un talón perforado (`oceano-800`, borde punteado) con el
  titular, la habitación y el plan, y la vigencia en `arena-200`. El resto de la pieza es sobrio.
- **Tokens:** solo los de `globals.css`. `turquesa-700/800` para el itinerario e «Incluye»,
  `atardecer-700` para lo que se paga en destino, neutros para el resto. Inter, como en toda la app.
  El cambio de tamaño lo da el destino en `text-6xl` `font-black`.
- **Revisión contra lo genérico:** la fila de datos con puntos medios se cambió por celdas rotuladas
  de pase de abordar, sin etiquetas en mayúsculas. El verde «Vista de cliente» salió: el verde está
  reservado a WhatsApp y el aviso pasó a texto gris. Los botones de versión dicen «Versión N», no «vN».
  La referencia va en su propia línea, sin puntos medios.

## Qué se construyó (verificado)

| Pieza | Dónde |
|---|---|
| Portada de pase de abordar, intro (la descripción del producto), «Tu viaje, día a día», «Incluye» agrupado (vuelos, alojamiento y alimentación, traslados, asistencia, además), «No incluye», «Se paga en destino» (no sumado al total), «Valor del viaje» con total grande, «Para reservar» con la ley ESCNNA, y pie legal con razón social, NIT y **RNT** | `apps/web/src/app/(impresion)/cotizaciones/[id]/imprimir/page.tsx` |
| Lógica pura: fechas sin zona horaria (R9), plurales, agrupación de inclusiones, itinerario | `apps/web/src/lib/propuesta-viajero-logica.ts` (+ spec, 9 casos) |
| Línea de tiempo del itinerario. **Punto de partida en 21st.dev**: «Timeline» de slide-cn (id 28298, sin dependencias), reducido a la variante vertical, sin `cloneElement` y con los tokens del proyecto | `apps/web/src/components/propuesta/linea-de-tiempo.tsx` |
| Lectura del producto con solo los campos públicos (`dias`, plan, inclusiones, exclusiones, descripción, cargos en destino, opciones de salida). Si falla, la pieza sale sin esas secciones | `obtenerProductoParaPropuestaApi` en `apps/web/src/lib/catalogo-api.ts` |
| El pie de privacidad y el aviso de cookies ya no salen en el PDF (`print:hidden`) | `components/privacidad/*` |
| Se quitó la llamada a `use` dentro de un try/catch (React lo prohíbe; salía «1 Issue» en dev) | página |

**Cómo se arma el itinerario sin inventar nada:** si la descripción del producto trae líneas
«Día N: …», se usa un tramo por día. Si no, sale un esqueleto con fechas reales: salida, estadía
(días 2 a N-1, con el plan de alimentación) y regreso. A esos tramos se suman la hora y el punto de
encuentro de la opción de salida cotizada. Solo dice «vuelo» si alguna inclusión es un tiquete o un
vuelo.

**R10:** la proyección sigue descartando `neto`, `margen` y `politica`. Del producto solo se leen
campos públicos. La prueba de confidencialidad ahora corre también con el producto cargado.

**Comprobaciones:** `tsc` sin errores, `eslint` limpio y `vitest` de toda la web en verde
(166 archivos, 1362 pruebas). Capturas con Playwright en modo demo: escritorio a 1440×900, móvil a
390×844 (sin desborde horizontal, `scrollWidth` = 390) y PDF A4 de dos páginas (portada, itinerario
e incluye en la primera; valor y condiciones en la segunda). Sin errores en consola.

## Lo que NO se hizo, y por qué

El catálogo **no guarda** estos datos. Mostrarlos exige backend (migración, ruta protegida y PR
aparte del carril `a/`). Quedan en la cola (`roadmap/tasks.yaml`, T-261 a T-266):

- **T-261 — RNT de la agencia en los ajustes** (`AjustesDeAgencia.rnt`, columna en `tenants`). Hoy el RNT
  sale solo en modo demo (`MOCK_CONFIGURACION_AGENCIA.rnt`). Con la API real, el pie lleva solo el
  nombre. La Ley 300 de 1996 exige el RNT en la publicidad: es lo más urgente de la lista.
- **T-263 — Imagen de portada por producto o destino** (subida a S3/MinIO, URL firmada). Mientras no
  exista, la portada es tipográfica. No se usan fotos de stock ni de terceros.
- **T-264 — Itinerario estructurado por día** en el producto, en lugar de leer «Día N» de la descripción.
- **T-265 — Hotel con nombre y categoría, y vuelos con horario** por versión o por reserva (ADR-0024).
- **T-262 — Datos legales de la agencia en la API**: razón social, NIT, dirección y teléfono. Hoy solo
  llega el nombre.
- **T-266 — Enlace web de la propuesta**, además del PDF (auditoría I3, «un enlace web después»).

## Supuesto / sin probar

- No se ha visto **contra la API real**. El producto se pide a `GET /api/v1/paquetes/:id` y la
  respuesta se valida con el esquema de contratos (`Paquete.pick`), pero ese camino solo se probó
  en las pruebas unitarias.
- El PDF se generó con Chromium (`page.pdf`). No se probó en Safari ni con «Guardar como PDF» de
  un celular.
