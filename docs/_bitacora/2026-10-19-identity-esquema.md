# 2026-10-19 — Identidad: esquema de la rebanada 1 del ADR-0011

Rama `feat/identity-esquema`, desde `a765601` (`origin/docs/adr-0011-autenticacion`). Agente `datos`.

## Qué entra

- Migración `20261019230000_identidad_global_y_roles_por_agencia`, **aplicada en Neon** (`neondb`).
- Tablas globales: `identidades`, `credenciales`, `sesiones`, `verificaciones` y
  `accesos_identidad`, declaradas en `excepciones_rls` (20 filas: DML para `viajapro_identidad`,
  solo `SELECT` sobre `accesos_identidad`, y cero explícito para los tres roles de siempre).
- Tablas por tenant con RLS forzada: `roles` (nueva) y `usuarios`, que gana `identidad_id` y
  `rol_id` (foránea compuesta) y pierde el `enum rol_usuario` y `hash_contrasena`.
- Roles: `viajapro_identidad` (LOGIN, sin contraseña, fuera de `roles_de_aplicacion`) y
  `viajapro_accesos` (NOLOGIN, dueño de `sincronizar_acceso_identidad`). `policies/002` los conoce.
- Catálogo de permisos `PERMISOS` en `packages/contracts/src/identidad.ts`, reflejado en el
  `CHECK roles_permisos_del_catalogo`.
- Semilla: tres roles por agencia e identidades para el equipo demo.
- `crear-rol-aplicacion.mjs` y `rotar-roles-y-actualizar-env.ps1` rotan también
  `viajapro_identidad` y escriben `DATABASE_IDENTIDAD_URL`.

## Decisiones

- **`accesos_identidad.tenant_acceso_id`, no `tenant_id`.** El aplicador de RLS de `001` es
  dirigido por datos: con ese nombre la tabla quedaría aislada y el selector de agencia, que corre
  sin tenant, vería cero filas (el mismo caso que `tenant_resuelto_id` del directorio).
- `usuarios → roles` es `NO ACTION` y no `RESTRICT`: el borrado en cascada de un tenant se lleva
  roles y usuarios en la misma sentencia.
- Relleno: DUENO/ADMINISTRADOR → rol DUENO; ASESOR/SOLO_LECTURA → ASESOR. No reversible en esa parte.

## Verificación

- Suite de aislamiento contra Neon: **63/63 dos veces**. Aserciones nuevas 61-66 (renumeradas al fusionar main, que ya usaba hasta la 60); 12, 13 y 14
  ampliadas (doce funciones SECURITY DEFINER tras fusionar main, tres propietarios); literal de la 11 y matriz de la 20 actualizados.
- `typecheck`, `lint`, `build`, `format:check` en verde. `pnpm test`: un fallo de
  `inbox-relay.e2e-spec.ts` en paralelo que pasa 7/7 aislado (contención en la base compartida).
- Mutaciones M14-M20 añadidas al arnés y vistas en rojo. **Incidente:** el arnés muta el
  esquema de la base COMPARTIDA. En la primera corrida se cayó al restaurar M6 y dejó
  `conversaciones_contacto_id_tenant_id_fkey` en su forma simple durante minutos; la restauré a
  mano y la segunda corrida terminó 20/20 y limpia. qa midió además unos 4 minutos de RLS
  apagada en `cotizaciones` mientras corría. **Las mutaciones quedan prohibidas contra Neon:
  pendientes de una base desechable** (rama de Neon propia o el Postgres del CI). Tras parar,
  comprobado solo con lecturas: RLS forzada en toda tabla con `tenant_id`, políticas canónicas,
  foráneas compuestas en su forma correcta, ningún disparador deshabilitado, ningún privilegio
  de las mutaciones vivo.

## Pendiente (cola, con dueño)

- **Esquema de Better Auth sin verificar contra su documentación**: la herramienta
  `docs-librerias` no estaba disponible en la sesión y la red estaba bloqueada. Las columnas son
  las del ADR. Falta confirmar campos que la biblioteca pueda exigir (p. ej. `image`, el
  identificador de cuenta y los tokens OAuth de `account`) y que genere los `id` como uuid. —
  `backend`, rebanada 2.
- **Hash del token de sesión y del OTP**: sin verificar si Better Auth lo hace de forma nativa;
  el esquema no lo impone. Condición del auditor para la rebanada 2. — `backend`, `auditor-seguridad`.
- Arnés de mutaciones contra una base desechable, nunca contra la compartida. — `devops`, `qa`.
- Hallazgo previo, no de esta rebanada: `paquetes_mayorista_id_fkey`, `temporadas_paquete_id_fkey`
  y `precios_temporada_id_fkey` (migración inicial) son foráneas SIMPLES entre tablas con tenant. —
  `datos`.
- Atar el `CHECK` de permisos al `z.enum` con una prueba. — `datos`.
- Contraseña de `viajapro_identidad`: el propietario corre `pwsh -File scripts/rotar-roles-y-actualizar-env.ps1`.
