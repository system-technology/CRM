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
- Capturas a 390, 820 y 1440 px sin desplazamiento lateral; contraste y navegación por teclado se
  revisaron en el código, no con una herramienta.

## Cola

- **T-531:** agregado por asesor en el servidor. Hoy son N consultas, en lotes de cuatro y con tope de 12.
- **T-532:** ventas del periodo por destino. Hoy el bloque muestra los archivos abiertos y lo dice.
- **Enganche pendiente (en T-344):** montar `<DashboardAdmin periodo zona />` en `/reportes` cuando la
  respuesta traiga `alcance: 'AGENCIA'`. Es del marco de T-343.
