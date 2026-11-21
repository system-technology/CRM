# 2026-11-21 · Dashboard de administración (T-344)

## Qué se hizo

Las piezas del dashboard de la administradora, en archivos nuevos de `apps/web` y sin tocar el marco de
`/reportes` (de T-343): `components/dashboard-admin/` (un bloque por tema y el contenedor
`DashboardAdmin`), `lib/dashboard-admin-logica.ts` (funciones puras) y `lib/dashboard-admin-api.ts`
(lecturas y maqueta).

Bloques: ventas cerradas por moneda, embudo y cotizaciones, tiempos de respuesta, comparación entre
asesores, por cobrar, salidas próximas (30 días) y destinos de los archivos abiertos. Cada bloque carga
por su cuenta, con esqueleto, error con «Reintentar» y «sin permiso» explicado: que fallen los cobros no
apaga las ventas.

## Enganche en `/reportes`

Con T-343 ya en `main`, `/reportes` monta `<DashboardAdmin periodo zona bloques=… />` debajo de
`ReportesListo` cuando **la respuesta** trae `alcance: 'AGENCIA'` (no un permiso leído en el cliente) y
no está activo el filtro «Míos». El selector, el título según `alcance` y los textos de T-485 no se
tocaron.

**Solo se montan cuatro bloques** (asesores, cobros, salidas, destinos). Ventas, embudo y respuesta ya
los pinta `ReportesListo`, y montar también los míos duplicaba cifras y `data-testid` (`ventas-COP`
existe en los dos y rompe los specs y el e2e H6 de T-343). La propiedad `bloques` hace que un bloque no
mostrado tampoco pida sus datos. Consecuencia: **el orden móvil «cobros primero» solo rige dentro de mi
componente**; en la página integrada, los bloques nuevos van tras la vista de T-343. La duplicación
queda en cola (T-534).

El spec de la página mockea `DashboardAdmin` y comprueba cuándo se monta (agencia sí; `PROPIO` no;
«Míos» lo desmonta; recibe el periodo y la zona). Sin ese mock, los specs de T-343 intentaban salir a la
red.

## Qué impone ADR-0035 y cómo quedó

| Regla | Cómo |
|---|---|
| La web pinta lo que la API devuelve | No lee permisos. Si la respuesta es `PROPIO` (o 403), muestra «Esta vista es de administración». El margen sale solo si la fila trae la clave `margen` |
| Periodo por defecto, mes calendario en la zona de la agencia, y comparación con el anterior del mismo largo | `periodo = 'este_mes'` y `rangoAnterior`; dos consultas |
| Porcentaje solo con `n ≥ 20` | `presentarTasa`: bajo 20, «7 de 15»; con 20 o más, el porcentaje y la fracción aparte |
| Dinero por moneda, sin TRM (R8) | Una tarjeta por moneda; el ranking de asesores ordena por ventas cerradas (un número), no por dinero |
| Margen distinto del alcance | Es una clave de la respuesta, no una consecuencia de `reportes.ver_agencia` |
| Sin PII ni teléfonos | Ningún bloque los trae; hay una prueba que lo vigila |

## Móvil: qué se decidió

- **Se reordena:** «Por cobrar» y «Salen pronto» van primero (piden una acción hoy); ventas, embudo,
  respuesta, asesores y destinos siguen. En escritorio, ventas primero.
- **Se transforma:** la tabla de asesores pasa a una tarjeta por asesor con ventas cerradas, lo vendido
  por moneda, aceptación y primera respuesta.
- **Se pliega, no se oculta:** conversión y fracción de respondidas, en «Más cifras».
- **Se acota:** salidas próximas muestra cinco con «Ver las N salidas».
- Hasta 1023 px (tablet incluida) rige el orden móvil; la tabla de asesores vuelve desde 768 px.

## Qué no se pudo verificar

- **Nada contra la API real ni Postgres:** las pruebas son vitest con la API simulada y las capturas
  salen de modo demostración. No se escribió e2e (T-346 lo cubre).
- La forma de la respuesta real de `GET /cobros` se valida con el esquema del contrato, no se vio.
- Capturas a 390, 820 y 1440 px de mi dashboard suelto, y de la página integrada a 390 y 1440 px, sin
  desplazamiento lateral propio (dos elementos del marco, una insignia de la navegación, desbordan
  por 1–2 px); contraste y navegación por teclado se
  revisaron en el código, no con una herramienta.

## Cola

- **T-531:** agregado por asesor en el servidor. Hoy son N consultas, en lotes de cuatro y con tope de 12.
- **T-532:** ventas del periodo por destino. Hoy el bloque muestra los archivos abiertos y lo dice.
- **T-534:** ventas, embudo y respuesta existen dos veces (`ReportesListo` y `DashboardAdmin`); decidir
  una sola versión.
