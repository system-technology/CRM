# 2026-11-21 · Pantalla «Cobros» y exportación a CSV (T-332, T-335)

Carril `b` (frontend). Rama `feat/web-cobros-quien-pago-quien-debe-T-332`.

## Qué se hizo

- `/cobros` (ruta privada, entrada «Cobros» en el grupo *Operar*, permiso `cobro.ver` que solo oculta):
  una fila por archivo abierto con total, pagado, saldo y estado de cobro; filtros por los cuatro
  estados; totales por moneda del servidor; estados vacío, cargando y error; tarjetas a menos de
  768 px y tabla desde ahí. El filtro y el alcance los aplica `GET /api/v1/cobros`: la web no recorta.
- «Cobros» está a un clic en el menú lateral y a dos en el celular (Más → Cobros).
- `exportarCobrosCSV` en `lib/exportar-csv.ts`: las mismas filas que se ven, importes en la unidad
  principal por `Money` (COP en pesos, USD en dólares con coma), sin neto ni margen (el contrato de
  cobro no los trae).
- Arreglo de fondo en `escaparCeldaCSV`: un número (p. ej. saldo a favor `-500000`) ya no se
  convierte en texto con apóstrofo. Los textos con `=`, `+`, `-`, `@` siguen neutralizados.

## Hallazgos para la cola

- `FilaDeCobro` no trae pasajeros ni nombre del contacto: la pantalla muestra file, destino y salida.
  Si el piloto quiere «pasajeros» en la tabla hace falta ampliar el contrato (carril API).
- La API pagina solo por `limite` (máx. 500) y marca `truncado`; la pantalla lo avisa. Sin cursor.
- `exportar-csv.ts` ya existía (T-119) con escapado de fórmulas; no había `exportarCobrosCSV`.

## Pendiente

- Los e2e (`07b-cobros-tabla.e2e-spec.ts`) los corre el CI; esta sesión no tuvo Postgres.
- Capturas: `docs/_bitacora/capturas/2026-11-21-cobros-390.png` y `-1440.png` (modo demostración).
