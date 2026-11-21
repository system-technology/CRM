# 2026-11-21 — T-346: reportes por nivel de acceso, probados en un navegador

> Sesión de QA, carril `b` (`apps/web/**`). Rama `test/web-permisos-reportes-entre-asesores-T-346`.
> Esta sesión **no pudo levantar Postgres**: el e2e nuevo lo corre el CI; aquí se vio contra una API
> falsa (ver «Qué se comprobó y qué no»).

## Qué entró

`apps/web/e2e/09-reportes-por-alcance.e2e-spec.ts` (registrado en el proyecto `flujo` de
`playwright.config.ts`), a 390 px y contra la API real:

- **Ana** (asesora) entra a `/reportes`: ve «Mis números» con **sus** cifras, sin el selector de
  agencia, sin el dashboard de administración, sin la comparación de asesores y sin el nombre de su
  compañero ni el de la dueña. Lo que se pinta es lo que el servidor contestó (`alcance: PROPIO`, sin
  las claves `porAsesor` ni `ventasPorDestino` en el texto crudo).
- **Carlos** (asesor, misma agencia) ve lo suyo, y no coincide con lo de Ana.
- **La dueña** ve la agencia: el dashboard, el selector, y a los dos asesores nombrados en la
  comparación; su total cuenta lo de los dos.
- **Ana, a mano**: desde su navegador y con su cookie pide `?asesorId=<Carlos>` y el servidor
  responde **403** sin cifras; con `yo` responde 200. Ocultar un ítem no es control de acceso.

**Las cifras distintas se siembran en la prueba**, no en la semilla: la semilla no da movimiento a Ana
ni a Carlos (una prueba donde ambos ven cero pasa en verde sin probar nada). Cada uno crea, por la
API y con su propia sesión, 2 y 3 oportunidades (el servidor las atribuye a quien las crea). Todo se
compara por **diferencia** contra lo que cada pantalla mostraba antes, así que no depende de lo que
haya dejado el resto del flujo. Entran con la clave de desarrollo que `identidad:sembrar-dev` pone a
toda identidad `@agenciademo.test`.

## Qué se comprobó y qué no

- **Visto aquí:** tipos, lint y formato; la prueba en **verde** contra una API falsa que se comporta
  como la real (alcance impuesto por sesión), y en **rojo** con dos mutaciones de esa API falsa:
  (1) el «servidor» devuelve alcance de agencia a una asesora → falla en «Ana debe recibir el
  alcance propio»; (2) el «servidor» acepta el `asesorId` de otro → falla en «asesorId de Carlos
  pedido por Ana: esperado 403, recibido 200».
- **A cargo del CI:** la prueba contra la API **real** (Postgres, RLS, sesiones de Better Auth). El
  rojo de arriba demuestra que las aserciones muerden; **no** demuestra nada del servidor real, cuyo
  aislamiento sigue cubierto por `reportes.e2e-spec.ts` de la API.

## Hipótesis

1. **Confirmada.** El cliente no filtra nada que deba filtrar el servidor: la pantalla decide el
   alcance con `resumen.alcance` de la respuesta y no lee el permiso para eso. No hubo hallazgo
   bloqueante.
2. **Parcial.** Los estados «cargando» y «error» (Ana y administración, claro y oscuro, 390 px) no
   se desbordan y su contraste es correcto. Lo que **sí** pierde contraste es el contenido cargado,
   ver abajo.
3. **Confirmada** para el sembrado (sin movimiento por asesor) y resuelta dentro de la prueba.

## Hallazgos de contraste (a la cola, no bloquean)

Medidos con el contraste calculado de cada texto visible (WCAG AA: 4,5:1 para texto pequeño):

- **Administración, modo claro:** los pies de las tarjetas de `ReportesListo` (`text-neutral-400`,
  11 px) dan 2,58:1: «Variación contra los…», «Aceptadas / enviadas…», cohortes, «p90:», «Aún sin
  datos».
- **Modo oscuro, Ana y administración:** pies en 3,78:1; «COP»/«USD»/«o más» de «Por cobrar hoy» en
  2,29:1; «Subió», «Debe», «Por vencer:», «Vencido:» (2,77:1) con colores de modo claro sin variante
  `dark:`.
- **En ambos modos:** la línea legal «Tratamiento de datos personales…» del marco (2,45:1 en claro).
- **«Mis números» de Ana en modo claro** quedó limpia salvo esa línea del marco.

El primer pase del medidor dio «0 hallazgos» en claro por un defecto del propio medidor (no entendía
colores `oklch()` de Tailwind); se corrigió resolviendo los colores con un canvas. Un medidor que
devuelve cero sin haberse visto fallar es la misma cobertura falsa que la de las pruebas de
aislamiento.

## Pendiente

- Cola: contraste de los pies y de los colores sin variante oscura (arriba). Dueño sugerido: `frontend`.
- `ESTADO.md` y `DIARIO.md`: se actualizan en el PR de cierre del lote.
