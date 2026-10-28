# Gestión de secretos y claves

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario** |
| Responsable | Propietario (custodia y rotación en producción); `devops` (matriz y procedimiento); `auditor-seguridad` (revisión) |
| Se apoya en | R6 de `CLAUDE.md`; [ADR-0013 §4](../03-adr/0013-despliegue-staging-y-produccion.md) (matriz por proceso); [ADR-0015](../03-adr/0015-cifrado-de-campos-sensibles.md) (claves derivadas y recifrado) |

## 1. Alcance

Todo valor de nivel N4 ([clasificación](05-politica-de-seguridad-de-la-informacion.md#4-clasificación-de-datos)):
claves de cifrado, secretos de firma, *tokens* de proveedores, cadenas de conexión, claves privadas
de las GitHub Apps y *deploy hooks*.

## 2. Reglas

| # | Regla |
|---|---|
| S1 | **Ningún secreto en el repositorio** (R6), ni en su historial, ni en issues, PR, bitácoras o conversaciones con agentes. El repositorio es público |
| S2 | **Un secreto por entorno.** Local, CI, staging y producción no comparten ningún valor. Los de CI nacen y mueren con el job (`openssl rand` en `.github/workflows/ci.yml`) |
| S3 | **Un secreto solo va al proceso que lo lee**, según la matriz de ADR-0013 §4. La web no recibe ninguno |
| S4 | **Fallo cerrado:** si falta un secreto obligatorio, el proceso aborta al arrancar; nunca cae a un valor por defecto |
| S5 | Los secretos se generan en la máquina del propietario (`openssl rand`) y se pegan **en el panel** del proveedor, nunca por chat ni por un agente |
| S6 | Las claves de cifrado tienen **copia fuera de Render** (ADR-0015: perder `CAMPOS_SENSIBLES_KEY` es perder todo lo cifrado). La copia está cifrada y solo la abre el propietario |
| S7 | Las credenciales de las agencias (tokens de WhatsApp) se guardan cifradas con AES-256-GCM en la base (R6), nunca en variables de entorno compartidas |
| S8 | Los secretos nunca se registran en logs, ni enteros ni recortados |

## 3. Quién accede

| Secreto | Quién lo ve | Dónde vive |
|---|---|---|
| Secretos de producción y staging | **Solo el propietario** | Grupos de entorno de Render por servicio; *Environments* de GitHub para la cadena de migración y los *deploy hooks* |
| Claves privadas de las GitHub Apps (`viajapro-integradora`, `-backend`, `-frontend`) | Propietario; los procesos locales que las usan | `~/.viajapro-keys`, fuera del repo (ADR-0016 §7) |
| `.env` locales | Cada desarrollador, solo con valores de desarrollo | Máquina local; ignorado por git |
| Agentes de IA | **Ninguno.** No leen `.env`, `*.pem`, `*.key` ni `secrets/` | Bloqueado por `permissions.deny` en `.claude/settings.json` |

## 4. Rotación

| Secreto | Cuándo se rota | Cómo, sin cortar servicio | ¿Soporte en el código hoy? |
|---|---|---|---|
| `WEBHOOK_PAYLOAD_KEY`, pimienta del directorio | Anual, o de inmediato ante sospecha | Variables `_VERSION` y `_PREVIOUS`: se sella con la nueva y se abre con ambas | **Sí** (variables declaradas en ADR-0013 §4) |
| `CAMPOS_SENSIBLES_KEY` (ADR-0015) | Al acercarse a 2^31 cifrados por clave derivada, o ante sospecha | Versión por fila + trabajo de recifrado por lotes | **No:** la implementación está en el PR #29, sin integrar, y el trabajo de recifrado no existe |
| `BETTER_AUTH_SECRET` | Anual, o ante sospecha | Cambiarlo invalida las cookies firmadas: todos vuelven a iniciar sesión. Se acepta | Sí (es una variable) |
| `META_APP_SECRET`, `POSTMARK_SERVER_TOKEN`, tokens de WhatsApp | Ante sospecha o salida de una persona con acceso | Regenerar en el panel del proveedor y pegar | Sí |
| Contraseñas de los roles de base | Anual, o ante sospecha | `rol:crear` por rama de Neon (ADR-0013 §5) | Sí |
| Claves de las GitHub Apps | Anual, o ante sospecha | Generar una nueva en la App, borrar la anterior | Sí (manual) |
| *Deploy hooks* | Ante sospecha | Regenerar en Render y actualizar el *Environment* | Sí (manual) |

**Ante sospecha de fuga, se rota primero y se investiga después.** Ver
[09-respuesta-a-incidentes.md](09-respuesta-a-incidentes.md).

## 5. Cómo se comprueba

| Regla | Comprobación |
|---|---|
| S1 | Job obligatorio `secretos` (gitleaks 8.30.1 sobre todo el historial) en cada PR y en `main`; hook `.claude/hooks/guard-secretos.mjs` antes de cada escritura de un agente |
| S3 | Revisión manual de los grupos de entorno de Render contra la matriz de ADR-0013 §4, al desplegar y en la revisión trimestral |
| S4 | `correo-postmark.spec.ts` «postmark sin token aborta…»; las pruebas de arranque de la API y el trabajador |
| S6 | El propietario restaura una clave desde la copia una vez al año y lo anota en `docs/_bitacora/` |
| Rotación | Cada rotación deja una línea en `docs/_bitacora/` con fecha, secreto (por nombre, nunca por valor) y motivo |

## 6. Estado real hoy (2026-10-27)

- **S1, S2 (CI), S4 y S8: se cumplen** y tienen comprobación automática.
- **S3, S5, S6: no verificables todavía**, porque no hay un servicio desplegado verificado en
  Render (ESTADO.md §3).
- **Inconsistencia de nombres por resolver:** ADR-0013 llama `ENCRYPTION_MASTER_KEY` a la clave
  maestra y ADR-0015 la llama `CAMPOS_SENSIBLES_KEY`. Hay que fijar un solo nombre antes de
  desplegar (`backend`, al integrar el PR #29).
- **No hay gestor de secretos dedicado:** los secretos viven en los paneles de Render y GitHub. La
  copia de S6 **no existe** porque la clave tampoco existe todavía en producción.
- **La rotación de `CAMPOS_SENSIBLES_KEY` no es posible** hasta que exista el trabajo de recifrado.
- Ninguna rotación se ha ejecutado ni ensayado.
