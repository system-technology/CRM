# 2026-11-21 · «Mis números» y retirada del conmutador (T-343, T-513)

## Qué se hizo
- **Se retira el conmutador «Vista Dueño / Vista Asesor».** `/reportes` pinta lo que dice `alcance` en la respuesta: `PROPIO` → «Mis números» (tarjetas apiladas, pensadas para 390 px); `AGENCIA` → el reporte de agencia, con selector «Toda la agencia / Míos» (`asesorId=yo`). La sección de margen aparece solo si la API entregó las claves (ya no depende de una pestaña).
- **Una sola entrada de menú.** `navegacion.ts` lleva `variantePropia`: sin `reportes.ver_agencia` el menú, la hoja «Más» y el título dicen «Mis números»; con él, «Reportes de la agencia». El permiso solo titula; la compuerta es el servidor.
- **Periodo por defecto: mes calendario** en la zona de la agencia, comparado con el periodo anterior del mismo largo.
- **Muestra pequeña:** bajo n = 20 la tasa se escribe como fracción («2 de 6»), no «n insuficiente».
- **«Hoy» (H3):** la tarjeta «Cotizaciones por vencer» contaba borradores y enviadas entre las 20 últimas; ahora se llama «Cotizaciones abiertas», marca «o más» si hay más páginas y reparte las enviadas por días de espera (0–3, 4–7, más de 7).
- **T-513:** `ResumenDeReportes` es la unión discriminada; desaparece el objeto permisivo. `ResumenDeReportesPorAlcance` queda como alias de exportación porque `apps/api` lo importa.

## Decisión que conviene mirar
Los criterios «cotizaciones abiertas **del asesor**» y «cobros por cobrar **del asesor**» **no se cumplen**: `/cotizaciones` y `/cobros` no traen asesor y muestran toda la agencia (T-490). Filtrarlas en el cliente sería que la web decida el alcance, justo lo que el ADR-0035 §5 prohíbe, y mostrar un total de agencia al asesor contradice §6. Quedan en cola con dueño de API (T-528). «Hoy» rotula lo que sí mide: «Incluye las cotizaciones de toda la agencia».

## Pendiente (cola)
T-528 (datos propios por API), T-529 (bloque «Sin responsable»), T-530 (paleta de comandos y bloque de «Hoy» que habla de «equipo»), filtro de asesor con nombre (T-344).

## Verificación
Pruebas unitarias y de componente de lo tocado. Lo visual, contra API simulada (modo demostración), no contra la API real; las e2e las corre el CI.
