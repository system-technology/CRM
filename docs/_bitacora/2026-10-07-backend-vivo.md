# 2026-10-07 — El backend cobra vida

**Participantes:** Claude Opus 5, en sesión autónoma mientras el propietario dormía
**Alcance:** de "no hay código" a una API funcionando contra Neon, con aislamiento verificado.

---

## Qué se hizo

| Versión | Qué entró |
|---|---|
| v0.7.0 | Fundaciones técnicas verificadas: dominio y base de datos |
| v0.7.1 | Fricciones del entorno eliminadas, con pruebas |
| v0.8.0 | **Backend funcionando**: contratos, semilla y API |

**`packages/contracts`** — la fuente de verdad entre API y web. Esquemas Zod del catálogo,
la cotización y las piezas comunes.

**Semilla con catálogo realista** — tres paquetes colombianos (San Andrés, Cartagena, Punta
Cana), cinco temporadas, 26 precios. Verosímiles, no reales.

**`apps/api`** — NestJS con el aislamiento aplicado de verdad: contexto de tenant, servicio de
Prisma que fija `app.current_tenant` por transacción, filtro de errores único, catálogo y
cotización.

## Verificado con peticiones reales, no solo compilando

| Prueba | Resultado |
|---|---|
| `GET /salud/listo` | `rol: viajapro_app`, `aislamiento: forzado` |
| `GET /api/v1/paquetes` sin sesión | 401 |
| Con tenant de la agencia demo | Los 3 paquetes |
| **Con un tenant que no existe** | **Cero filas — RLS funcionando en la API** |
| Cotizar 2 ADT + 2 CHD en diciembre | Doble, 2 habitaciones, 9.100.000 COP, margen 20% |
| Cotizar 3 ADT en doble | **Avisa de 1 plaza vacía pagada** |
| Cotizar 2 ADT + 1 infante | 1 habitación — el bebé no suma |
| Puente de Reyes | Gana la temporada más corta sobre la alta |
| Cero adultos | Rechazado con el campo exacto |
| Fecha sin tarifa | Error del dominio, legible |

## Dos defectos que solo aparecieron ejecutando

**1. `tsx` no implementa `emitDecoratorMetadata`.** Usa esbuild, que no lo soporta. NestJS no
podía resolver las dependencias del constructor y llegaban como `undefined` — con la aplicación
arrancando, conectándose a la base de datos y mapeando rutas sin quejarse. El síntoma aparecía
en la primera petición, lejos de la causa. Se compila con `tsc`.

**2. La sugerencia de acomodación miraba solo el precio de adulto.** Con 2 adultos y 2 niños
proponía cuádruple, que el mayorista no publica para niños: callejón sin salida para una
familia, que es el cliente más común de una agencia.

El segundo es el importante. **Solo se vio porque el catálogo es realista.** Con `test1`,
`test2` y un precio plano por pasajero, habría llegado a producción — y habría fallado justo
con el perfil de cliente que más vende.

## Qué aprendimos

**Los datos de prueba verosímiles no son cosmética, son un instrumento de detección.** La
diferencia entre un seed de juguete y un tarifario real es la diferencia entre encontrar el
defecto hoy o que lo encuentre una agencia frente a un cliente.

**Compilar no es funcionar.** El backend pasó `typecheck` limpio con una inyección de
dependencias completamente rota. Las compuertas automáticas son necesarias y no suficientes:
hubo que levantar el servidor y hacerle preguntas.

**El arranque que se niega a arrancar vale más que el que avisa.** `PrismaService` aborta si el
rol de conexión tiene `BYPASSRLS`. Si solo registrara una advertencia, el sistema funcionaría
con normalidad mientras el aislamiento sería ficticio, y nadie leería ese log hasta que una
agencia viera datos de otra.

**Trabajar sin el propietario tiene un límite claro y conviene respetarlo.** Se avanzó en todo
lo que no exigía una decisión suya. Lo que la exige quedó anotado, no inventado: el tarifario
real, el nombre comercial, el modelo de cobro.
