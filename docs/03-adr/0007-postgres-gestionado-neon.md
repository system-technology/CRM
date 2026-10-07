# ADR-0007 — PostgreSQL gestionado (Neon) para desarrollo y entornos no productivos

- **Estado:** Aceptado
- **Fecha:** 2026-10-07
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `datos`, `devops`, `auditor-seguridad`

---

## Contexto

La fuerza es concreta y bloqueante: **el entorno de desarrollo no tiene Docker instalado**, y sin
PostgreSQL no se pueden aplicar migraciones, probar políticas RLS ni ejecutar la prueba de
aislamiento entre tenants — que es la compuerta más importante del proyecto
([ADR-0003](0003-multitenancy.md)).

Sin base de datos, el código del esquema se escribe pero no se verifica, y una rama sin verificar
no puede pasar la compuerta de integración ([ADR-0005](0005-modelo-de-ramas.md)). El trabajo se
acumula sin poder cerrarse.

## Opciones consideradas

### A — Instalar Docker Desktop en cada máquina de desarrollo

- **Gana:** entorno idéntico al de producción; sin dependencia externa; sin costo; los datos no
  salen de la máquina.
- **Cuesta:** instalación pesada; consume memoria de forma permanente; en Windows arrastra WSL2;
  cada persona nueva repite el montaje.
- **Cierra:** nada.

### B — PostgreSQL gestionado en la nube: Neon (elegida)

PostgreSQL serverless con ramificación de bases de datos, nivel gratuito y escalado a cero.

- **Gana:** cero instalación; **ramas de base de datos por rama de git**, que encaja exactamente
  con [nuestro modelo de ramas](0005-modelo-de-ramas.md); accesible desde cualquier máquina;
  despliegue a `dev` y `staging` con el mismo proveedor.
- **Cuesta:** dependencia de un tercero; arranque en frío en el nivel gratuito; **los datos salen
  del país** (ver consecuencias); y una trampa de seguridad grave descrita abajo.
- **Cierra:** nada: la aplicación habla PostgreSQL estándar y puede moverse.

### C — PostgreSQL instalado nativamente en Windows

- **Gana:** sin Docker, sin nube.
- **Cuesta:** divergencia entre máquinas; el montaje de extensiones (`pg_trgm`, `unaccent`,
  `pgcrypto`) es manual y propenso a diferencias; nada reproducible.
- **Cierra:** la garantía de que lo que funciona en una máquina funciona en otra.

## Decisión

**Opción B para desarrollo, `dev` y `staging`. La opción A sigue soportada** —
`infra/docker/docker-compose.yml` se mantiene — para quien prefiera trabajar sin conexión.

**Producción se decidirá aparte**, cuando haya clientes. Esta decisión no la prejuzga.

### La condición que hace válida la decisión

> **El rol de la aplicación NO puede ser miembro de `neon_superuser`.**

El rol que Neon crea por defecto en un proyecto **es miembro de `neon_superuser`, que tiene el
atributo `BYPASSRLS`**. Una aplicación conectada con ese rol **se salta todas las políticas RLS**.

Esto es lo más peligroso de esta decisión, porque **el fallo es silencioso**: las consultas
devuelven datos, nadie ve un error, y el aislamiento entre agencias es ficticio hasta que una
agencia ve los datos de otra.

Por tanto:

1. El rol `viajapro_app` se crea **por SQL**, explícitamente, sin `BYPASSRLS` y sin pertenecer a
   `neon_superuser`. Script: `packages/database/prisma/policies/002-rol-aplicacion.sql`.
2. La aplicación se conecta **siempre** con `DATABASE_APP_URL` (ese rol). `DATABASE_URL` queda
   reservada a las migraciones, y solo a ellas.
3. **La prueba de aislamiento es la única evidencia aceptable.** No la documentación del proveedor.
   Comprueba `rolbypassrls = false` e intenta lecturas y escrituras cruzadas reales; si el
   proveedor bypasea, falla ruidosamente.
4. `FORCE ROW LEVEL SECURITY` ya estaba en el diseño y neutraliza el otro camino de evasión: el
   dueño de la tabla también se salta RLS por defecto.

### Conexión agrupada frente a conexión directa

Neon ofrece dos puntos de conexión y **confundirlos rompe cosas distintas**:

| Punto | Para qué | Variable |
|---|---|---|
| Agrupado (`-pooler`) | La aplicación en ejecución | `DATABASE_APP_URL` |
| Directo | Migraciones de Prisma y DDL | `DATABASE_URL` / `DIRECT_URL` |

Las migraciones **no funcionan** contra el punto agrupado. Prisma lo resuelve con `directUrl` en
el bloque `datasource`.

Detalle relevante para nosotros: el agrupador trabaja en modo transacción, donde `SET` a secas no
sobrevive entre sentencias. **Nuestro diseño ya usa `SET LOCAL`** dentro de la transacción
(ADR-0003), que es justo lo que funciona ahí. Si hubiéramos usado `SET`, el contexto de tenant se
perdería de forma intermitente e irreproducible.

## Consecuencias

### Positivas
- Desbloquea la verificación del esquema, las políticas RLS y la prueba de aislamiento **hoy**.
- Una rama de base de datos por rama de git: cada funcionalidad prueba migraciones sobre una copia
  real sin tocar a nadie.
- Nadie instala nada. Una persona nueva clona y trabaja.
- `dev` y `staging` con el mismo proveedor y el mismo comportamiento.

### Negativas
- **Dependencia de un tercero** para desarrollar. Mitigación: el `docker-compose.yml` se mantiene
  y funciona; migrar es cambiar una cadena de conexión.
- **La trampa de `BYPASSRLS`.** Mitigación: el rol se crea por script y la prueba de aislamiento es
  compuerta de CI. **Si esa prueba se desactiva alguna vez, esta decisión deja de ser segura.**
- **Residencia de datos.** Los servidores de Neon están fuera de Colombia. Para desarrollo es
  irrelevante —son datos sintéticos—, pero deja dos obligaciones:
  - **Nunca datos reales de clientes en `dev` ni `staging`.** Ya era regla
    ([operación](../06-operacion/01-entornos-y-despliegue.md)); ahora además es un asunto de
    transferencia internacional de datos.
  - Si producción acabara en un proveedor fuera del país, hay que resolver la **transferencia
    internacional** bajo la Ley 1581 de 2012: cláusulas contractuales, consentimiento informado o
    destino con nivel adecuado de protección. **Pendiente para la revisión legal**, registrado en
    [protección de datos](../05-seguridad/02-proteccion-de-datos.md).
- Arranque en frío en el nivel gratuito: la primera consulta tras inactividad tarda. Molesto en
  desarrollo, inaceptable en producción — otra razón para decidir producción aparte.

### Qué habría que cambiar para revertir
Una cadena de conexión. La aplicación habla PostgreSQL estándar y no usa ninguna extensión
propietaria del proveedor. Es de las decisiones más baratas de revertir del proyecto.

## Cuándo revisar esta decisión

- **Antes de producción**, sin excepción: residencia de datos, arranque en frío, respaldos y
  recuperación a un punto en el tiempo son otra conversación.
- Si el arranque en frío entorpece el desarrollo diario.
- Si la prueba de aislamiento alguna vez falla contra Neon: **la decisión queda suspendida** hasta
  entender por qué, porque significaría que el aislamiento no es el que creemos.
