# 2026-10-13 — La documentación alcanza al ADR-0009

**Participantes:** `documentador`, a petición del agente principal.
**Duración / alcance:** una pasada de sincronización de `docs/` tras aceptarse el ADR-0009. Rama
`docs/adr-0009-parametrico`. No se tocó código, `ESTADO.md` ni ningún ADR.

## Qué se hizo

- **Diccionario** (`docs/01-producto/02-lenguaje-ubicuo.md`): bloque nuevo «Vigencia y salida» con
  las seis entradas que propone el ADR —`Vigencia`, `Departure`, `Fare`, `PricingUnit`,
  `PricingPolicy`, `TripFormat`—. `DepartureCost` y `BreakEven` **no** se añadieron: el ADR los deja
  nombrados y no propuestos. Se ajustaron `Temporada` (ahora un caso de vigencia), `Paquete` (plantilla
  sin precio), `Acomodación` (condición opcional), `Tarifario` y se movió `Salida` al bloque nuevo.
  Entrada nueva «Unidad mínima de la moneda» en Dinero.
- **Cabeza de playa** (`07-cabeza-de-playa-paquetes.md`): reapuntada al modelo de vigencias. Las siete
  preguntas a la agencia piloto llevan ahora su estado. Dice con todas las letras que el camino viejo
  sigue vivo en el código.
- **Contextos delimitados** (`02-contextos-delimitados.md`): `quoting` ahora declara que posee
  `Package`, `Vigencia`, `Departure`, `Fare` y la política de precio, y que lo posterior a vender una
  silla es de `booking`.
- **R8** corregido donde mentía: `CLAUDE.md`, `AGENTS.md`, plantilla de PR, skill
  `handoff-ia-externa` y `docs/09-ia/05-interoperabilidad-multi-ia.md`. Decían «centavos»; es «unidad
  mínima de la moneda», y en COP es el peso.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| **No tocar ADR-0006**, ni siquiera con nota al pie | Un ADR aceptado no se edita, y una nota al pie es una edición. Además ya existe la corrección con fecha y autoridad: el §6 del ADR-0009 dice cuál celda leer de otro modo y que es inventario, no decisión. Una segunda nota duplicaría el hecho y podría desincronizarse | ADR-0009 §6; este documento. Falta anotarlo en `ESTADO.md` (lo mantiene el agente principal) |
| Las entradas del diccionario usan el nombre en inglés del ADR, con nota de que el código dice `Vigencia`, `Tarifa`, `PoliticaDePrecio` | Mentir en el diccionario sobre el nombre real sería peor que declarar la distancia | `02-lenguaje-ubicuo.md`, cabecera del bloque |

## Qué quedó pendiente

- [ ] **Convención de nombres.** `CLAUDE.md` §6 dice «nombres de dominio en inglés en el código»; el
      esquema Prisma y los contratos usan español (`Paquete`, `Vigencia`, `Tarifa`, `Mayorista`,
      `Oportunidad`). O se cambia la regla o se cambia el código. Dueño: `arquitecto`.
- [ ] **Camino viejo sin retirar.** Siguen vivos `POST /api/v1/paquetes/cotizar`, las tablas
      `temporadas` y `precios`, y la web llama a esa ruta. El ADR los retira; falta hacerlo. Dueño:
      `backend`.
- [ ] **`TripFormat` no existe como tabla.** Solo aparece como comentario en la semilla del catálogo
      real. Dueño: `datos`.
- [ ] `DepartureScheduled` y `DeparturePriced` no existen en el código.
- [ ] `docs/02-arquitectura/03-modelo-de-datos.md` no describe `vigencias`, `tarifas` ni
      `politicas_de_precio`. No se tocó en esta pasada. Dueño: `documentador`.
- [ ] Nota para `ESTADO.md`: la celda «Catálogo» de la tabla de ADR-0006 se lee ahora «vigencias,
      salidas y tarifas».

## Qué aprendimos

- Las dos formas de vender conviven en la hoja real: siete grupos con fecha publicada y cuatro super
  excursiones con fecha propia. Por eso la vigencia es un eje y no dos modelos.
- Catálogo sembrado: 33 paquetes, 78 vigencias con tarifa y 79 tarifas, del tarifario de Agencias
  André's Tours.
- El error de «centavos» no era de código —`Money` ya trata COP con `decimales: 0`— sino de redacción.
  La regla escrita mentía y un agente que la lee al pie de la letra multiplica por cien.
