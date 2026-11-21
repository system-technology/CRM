# 2026-11-21 — Preparar la demo de staging (T-600)

## Problema
Un cliente prueba la demo en staging y no puede iniciar sesión. `deploy-staging.yml` migra pero no
siembra, y ningún paso creaba contraseñas: staging tenía esquema completo y, como mucho, usuarios
sin credencial. El único canal con acceso a Neon es el CI (`DIRECT_URL` del Environment `staging`).

## Qué se hizo (rama `a/T-600-preparar-demo-staging`, sin PR todavía)
- `apps/api/src/modules/identity/scripts/preparar-demo-staging.ts` (+ `.dominio.ts` puro y su spec):
  dos fases. `diagnosticar` cuenta agencias, identidades, usuarios y credenciales antes de tocar
  nada y aplica las guardias; `credencial` crea un usuario dueño de la agencia demo con el correo y
  la contraseña elegidos, hasheada con `hashPassword` de Better Auth y verificada con `verifyPassword`.
- `.github/workflows/preparar-demo-staging.yml`: `workflow_dispatch` solo manual, Environment
  `staging`. Inputs `correo` (por defecto `demo@viajapro.app`) y `contrasena` (obligatoria, sin
  valor por defecto: uno en el YAML sería el repositorio). Orden: guardia, diagnóstico, semilla
  existente (`prisma/seed.ts`), credencial. El resumen del run da el correo y la contraseña en claro.
- Script `demo:preparar-staging` en `apps/api/package.json`.

## Decisiones
- Un usuario NUEVO con el correo elegido, no renombrar `dueno@agenciademo.test`: la semilla hace
  upsert por ese correo y duplicaría a la persona al volver a correr.
- La contraseña mantiene el mínimo de 12 caracteres de Better Auth. No se baja para la demo.
- El script vive en `apps/api` y no en `packages/database` porque `better-auth` solo es dependencia
  de `apps/api`. No se añadió ninguna dependencia, ni migración, ni se tocó `schema.prisma`.
- Guardias: Environment `staging` fijo y solo sobre `main`; `PREPARAR_DEMO_ENTORNO=staging`; base no
  local; cero agencias ajenas a `agencia-demo`.

## Límites y pendiente
- No se pudo ejecutar contra una base (sin Postgres): el flujo contra Neon queda sin probar hasta
  lanzar el workflow. Solo funciona tras integrar el PR en `main` (ruta protegida: espera al propietario).
- El resumen muestra la contraseña en claro y el repositorio es público: rotarla (relanzar con otra).
- Cola: endpoint de alta protegido o cambio de contraseña propio, para no depender de un script.

## Corrección: el CI paró esto por aislamiento (R1), y tenía razón

El primer empuje rompía `src/shared/tenant/consultas-sin-filtro.spec.ts` («ninguna lectura de
producción sobre una tabla con tenant carece de `where`»). **No era inestabilidad**: se relanzó y
volvió a fallar igual.

La consulta era `prisma.usuario.count()` en el diagnóstico —«cuántos usuarios hay»—, sobre una tabla
que lleva `tenant_id`. **El diagnóstico contaba usuarios de toda la base.**

**Hallazgo útil para quien venga:** esa prueba recorre el AST de todo `apps/api/src`, scripts
incluidos, y **no tiene mecanismo de excepción**: no hay lista ni comentario que permita saltársela.
O se filtra, o no pasa.

**Arreglo:** el recuento cuenta solo dentro de la agencia demo (`where: { tenantId: demo.id }`), y da
0 si la demo no existe. No se pierde el diagnóstico: la guarda ya se niega si hay agencias ajenas a
`agencia-demo`, así que cuando el script continúa todos los usuarios de la base son de la demo. La
tabla del resumen ahora dice «Usuarios de la agencia demo».

**Lo que NO se hizo, y es la parte importante:** no se tocó la prueba, ni se usó `$queryRaw` para
esquivar el detector, ni se movió la consulta de sitio. Con un cliente esperando, la tentación de
apagar la alarma es justo la que `CLAUDE.md` §3.1 prohíbe: el aislamiento entre agencias es el único
sitio donde no se recorta.
