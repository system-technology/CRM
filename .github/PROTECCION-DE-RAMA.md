# Protección de la rama `main` en GitHub

> **Estado: ACTIVA.** Es la mitad de servidor de [ADR-0005](../docs/03-adr/0005-modelo-de-ramas.md).
> La copia versionada de la configuración es [`proteccion-main.json`](proteccion-main.json); la
> fuente de verdad es el servidor:
>
> ```bash
> gh api repos/system-technology/CRM/branches/main/protection
> ```
>
> Última comprobación contra el servidor: 2026-10-27 (T-083). Si el servidor y el JSON difieren,
> manda el servidor y se corrige el JSON (o se aplica el JSON deliberadamente, ver más abajo).

## Historia, en una línea

Mientras el repositorio fue **privado** (`Alfavear/CRM`) en el plan gratuito, GitHub no permitía
proteger ramas (`403: Upgrade to GitHub Pro or make this repository public`) y `main` solo tenía
hooks locales. El repositorio pasó a **público** (`system-technology/CRM`) y la protección existe
y es gratuita. El repositorio público implica que todo el código y la documentación son visibles:
ningún secreto ni dato de cliente puede entrar jamás (R6, regla del check `secretos`).

## Qué está configurado (copia de `proteccion-main.json`)

| Opción | Valor real | Por qué |
|---|---|---|
| **Require a pull request before merging** | Sí | Nada entra sin pasar por PR |
| └ Required approvals | **0** | El control humano lo da el propietario de código, no un contador de aprobaciones |
| └ Require review from Code Owners | **Sí** | Las rutas protegidas (`CODEOWNERS`: migraciones, RLS, cifrado, `.github/`, `infra/`, `scripts/`, dependencias, ADR…) esperan la aprobación del propietario |
| └ Dismiss stale approvals on new commits | Sí | Una aprobación es de un código concreto |
| └ Require approval of the most recent push | No | Con 0 aprobaciones requeridas no aporta |
| **Require status checks to pass** | Sí, rama al día (`strict`) | Las compuertas, en servidor |
| └ Checks requeridos (8) | `secretos`, `typecheck`, `lint`, `build`, `test`, `aislamiento-tenants`, `fronteras-entre-modulos`, `convencion-de-commits` | Ver `.github/workflows/ci.yml`. Los jobs informativos (p. ej. `auditoria-dependencias`) NO están en la lista |
| **Require conversation resolution** | Sí | Ningún comentario de revisión se queda sin respuesta |
| **Require linear history** | No | Se usa merge con commit a propósito: el commit de merge es la evidencia de la compuerta |
| **Require signed commits** | No | Pendiente de que el equipo tenga firma configurada |
| **Do not allow bypassing the above settings** (`enforce_admins`) | **Sí** | Incluye a los administradores |
| **Allow force pushes / deletions** | No / No | Reescribir o borrar `main` rompe el repositorio de todos |

## La casilla que de verdad importa

> **`enforce_admins`** — incluir a los administradores.

Sin ella, el dueño del repositorio puede saltarse todo, y la circunstancia en que alguien se salta
una compuerta no es un martes tranquilo sino un viernes a las siete con un cliente esperando.
Si la protección no te incumbe a ti, no es una protección: es una sugerencia.

## Verificación

Comprobar periódicamente que **falla** lo que debe fallar:

```bash
# 1. Debe ser rechazado por el servidor
git checkout main
git commit --allow-empty -m "prueba: no debería entrar"
git push origin main            # → rechazado: protected branch

# 2. Un PR con CI en rojo no debe poder fusionarse
# 3. Un PR que toca una ruta protegida sin aprobación del propietario no debe poder fusionarse
```

Una protección que no se ha probado no está configurada, está declarada.

## Cambiar la protección

1. Editar `proteccion-main.json` (ruta protegida: la aprueba el propietario).
2. Aplicarlo:

   ```bash
   gh api -X PUT repos/system-technology/CRM/branches/main/protection \
     --input .github/proteccion-main.json
   ```

3. Releer con `gh api repos/system-technology/CRM/branches/main/protection` y comprobar que el
   servidor coincide con el JSON. Si añades o quitas un check obligatorio, actualiza también
   `ci.yml`, `docs/07-ingenieria/03-git.md` y la regla R11.

## Qué la sostiene

- **El servidor**: la protección de arriba. Ya no depende de la disciplina de una persona.
- **Los hooks locales**: una barandilla contra el accidente, no seguridad.
- **El agente `integrador` y el auto-merge**: las dos vías por las que un PR verde entra en `main`.
