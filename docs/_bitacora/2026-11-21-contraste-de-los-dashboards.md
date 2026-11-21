# 2026-11-21 — T-583: contraste AA en los dashboards de reportes

> Carril `b` (`apps/web`). Rama `b/T-583-contraste-dashboards`. Sin Postgres: se vio con `?demo=1`.

## Qué se hizo

Los textos de los dos dashboards (administración y asesor) y la línea legal del marco pasan de 4,5:1 en
claro y en oscuro, a 390 px. Solo clases de Tailwind, ni un token ni la paleta.

- Pies y rótulos neutros: `text-neutral-600 dark:text-neutral-400` (antes `text-neutral-400 dark:text-neutral-500`,
  `text-neutral-500` o `text-neutral-600` sin variante oscura).
- Colores semánticos con variante oscura: `ok-700` con `dark:text-ok-400`, `alerta-700` con `dark:text-alerta-400`,
  `aviso-700` con `dark:text-amber-400` (la familia `aviso` solo declara 50/600/700: una clase `aviso-300`
  no emitiría CSS, ver T-561), `emerald-700` y `rose-700` con su 400.
- Archivos: `app/(app)/reportes/page.tsx` (el `ReportesListo` de la demostración), `components/reportes/*`,
  `components/dashboard-admin/*`, `components/privacidad/pie-de-pagina-privacidad.tsx` (línea legal, una sola vez).

## Medición (medidor con canvas, entiende `oklch()`)

Antes: claro 2,58 (pies de admin) y 2,46 (línea legal); oscuro 3,78 (pies), 2,29 («COP», «USD», «o más»),
2,77 («Vencido:»), 3,57 («Por vencer:», «Debe», «Pagado», «Subió»), 3,34 (variación en esmeralda), 3,96 (línea legal).
Después: mínimo 5,02 en claro y 6,48 en oscuro, 0 hallazgos en las cuatro combinaciones.

## Qué quedó fuera

- No se creó una prueba de contraste en CI: el medidor vive en la sesión, no en el repositorio (cola).
- Solo se midieron `/reportes` en admin y asesor; el resto de pantallas con el patrón `text-neutral-400
  dark:text-neutral-500` no se tocó (cola: barrerlo con el mismo medidor).
- La clase `dark` no llega a `<html>` en el servidor de desarrollo con el script anti-parpadeo; el medidor la añade.
