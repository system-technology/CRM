# Protección de la rama `main` en GitHub

> **Estado: BLOQUEADO por el plan de la cuenta.** Es la mitad que falta de
> [ADR-0005](../docs/03-adr/0005-modelo-de-ramas.md).

## El problema, en una línea

El repositorio es **privado** (`Alfavear/CRM`) y la cuenta está en el **plan gratuito**.
GitHub no permite proteger ramas ni crear *rulesets* en repositorios privados del plan gratuito:

```
403: Upgrade to GitHub Pro or make this repository public to enable this feature.
```

Resultado: hoy **`main` no tiene ninguna protección de servidor**. Lo único que hay son los hooks
locales, que son una barandilla contra el accidente, **no seguridad**.

## Las tres salidas

| Opción | Protección de `main` | Estrategia expuesta | Costo |
|---|---|---|---|
| **GitHub Pro** y seguir privado | ✅ Completa | No | De pago, mensual — verificar precio vigente |
| **Repositorio público** | ✅ Completa, gratis | **Sí**, todo visible | Gratis |
| **Seguir como está** | ❌ Solo hooks locales | No | Gratis, con riesgo asumido |

**Recomendación: GitHub Pro.** Es la única que da las dos cosas. Mientras el proyecto siga siendo
una sola persona con disciplina, la tercera opción es tolerable; en cuanto entre una segunda
persona al repositorio, deja de serlo — porque la protección existe precisamente para los días en
que alguien tiene prisa.

Mientras tanto, la regla R11 la sostienen el agente `integrador` y los hooks. **Riesgo registrado
en `ESTADO.md`.**

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

## Qué hacer en cuanto se desbloquee

Si se activa GitHub Pro (o el repositorio pasa a público), aplicar la configuración de arriba
**el mismo día**. Se puede hacer desde la terminal:

```bash
gh api -X PUT repos/Alfavear/CRM/branches/main/protection \
  --input .github/proteccion-main.json
```

Y después **probar que falla lo que debe fallar** — las tres comprobaciones de la sección anterior.
Una protección sin probar está declarada, no configurada.

## Mientras tanto

- Los hooks locales son toda la protección que hay. Son una barandilla, **no un muro**.
- El agente `integrador` es la compuerta real, por procedimiento, no por mecanismo.
- Funciona mientras el repositorio lo toque una sola persona con disciplina.
  **Deja de funcionar el día que entre alguien más.**
- **Riesgo asumido y registrado en `ESTADO.md`.**
