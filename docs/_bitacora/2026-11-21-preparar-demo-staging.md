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
