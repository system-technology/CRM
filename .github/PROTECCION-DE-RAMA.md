# Protección de la rama `main` en GitHub

> **Tarea pendiente, y es la mitad que falta de [ADR-0005](../docs/03-adr/0005-modelo-de-ramas.md).**
>
> Los hooks locales (`.claude/hooks/guard-rama.mjs`) son una barandilla contra el accidente.
> **La protección real es de servidor** y hay que configurarla en cuanto exista el repositorio
> remoto. Mientras no esté, la regla depende de disciplina, no de un mecanismo.

---

## Qué configurar

En GitHub → **Settings → Branches → Add branch protection rule**, patrón `main`:

| Opción | Valor | Por qué |
|---|---|---|
| **Require a pull request before merging** | ✅ | Nada entra sin revisión |
| └ Required approvals | **1** | Con un equipo pequeño, uno basta y no bloquea |
| └ Dismiss stale approvals on new commits | ✅ | Una aprobación es de un código concreto, no de una rama |
| **Require status checks to pass** | ✅ | Las compuertas, en servidor |
| └ Require branches to be up to date | ✅ | Obliga a ponerse al día antes de fusionar |
| └ Checks requeridos | `typecheck`, `lint`, `test`, `build`, `aislamiento-tenants`, `secretos` | Ver `.github/workflows/ci.yml` |
| **Require conversation resolution** | ✅ | Ningún comentario de revisión se queda sin respuesta |
| **Require linear history** | ❌ | Usamos `merge --no-ff` a propósito: el commit de merge es la evidencia de la compuerta |
| **Require signed commits** | Recomendado | Cuando el equipo tenga GPG configurado |
| **Do not allow bypassing the above settings** | ✅ | **Incluye a los administradores** |
| **Allow force pushes** | ❌ | Reescribir `main` rompe el repositorio de todos |
| **Allow deletions** | ❌ | — |

---

## La casilla que de verdad importa

> **«Do not allow bypassing the above settings»** — incluir a los administradores.

Sin ella, el dueño del repositorio puede saltarse todo. Y la circunstancia en que alguien se salta
una compuerta no es un martes tranquilo: es un viernes a las siete de la tarde con un cliente
esperando. **Exactamente cuando más probable es el error caro.**

Si la protección no te incumbe a ti, no es una protección: es una sugerencia.

---

## Verificación

Una vez configurada, comprobar que **falla** lo que debe fallar:

```bash
# 1. Debe ser rechazado por el servidor
git checkout main
git commit --allow-empty -m "prueba: no debería entrar"
git push origin main            # → rechazado: protected branch

# 2. Un PR con CI en rojo no debe poder fusionarse
# 3. Un PR sin aprobación no debe poder fusionarse
```

Si cualquiera de las tres pasa, la protección no está bien puesta. **Una protección que no se ha
probado no está configurada, está declarada.**

---

## Mientras no haya remoto

El repositorio es local y sin remoto. Hasta que exista:

- Los hooks locales son toda la protección que hay.
- El agente `integrador` es la compuerta real, por procedimiento.
- **Riesgo asumido y registrado en `ESTADO.md`.**

Primer paso cuando se cree el remoto: configurar esto **antes** del primer `push`.
