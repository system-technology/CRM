# 2026-10-07 — Gobierno de la integración y primer commit

**Participantes:** propietario del producto + Claude Opus 5
**Alcance:** modelo de ramas, compuerta de integración, y commit de génesis del repositorio.

---

## Qué se hizo

- Agente `integrador`: guardián de `main`, con un procedimiento de siete compuertas.
- Hook `guard-rama.mjs`: impide escribir en `main` sin autorización y bloquea siempre la
  reescritura del historial.
- Hook `autorizar-integracion.mjs`: autorización de un solo uso, 30 minutos, registrada en
  `docs/_integraciones/registro-de-autorizaciones.log`.
- Comando `/integrar`, plantilla de pull request, guía de protección de rama en GitHub, y
  workflow de CI con las mismas compuertas en servidor.
- ADR-0005 y reescritura de `docs/07-ingenieria/03-git.md`.
- Regla R11 en `CLAUDE.md`.
- **Commit de génesis `v0.1.0`**: 119 archivos, andamiaje completo, sin código de aplicación.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó |
|---|---|---|
| `main` protegida, compuerta con dueño identificable | Los agentes producen más rápido de lo que nadie revisa. Sin compuerta, entra a producción lo que nadie miró | ADR-0005, regla R11 |
| Sin rama `develop` | Un SaaS multi-tenant tiene una sola versión viva. `develop` añadiría un segundo punto de conflictos y la duda crónica de qué hay en producción | ADR-0005 |
| `release/*` cuando haya clientes en producción | Disparador escrito para que sea decisión, no olvido. Previsiblemente Fase 2 | ADR-0005 |
| Una sola puerta para toda escritura en `main` | Commit, merge y push pasan por la misma autorización. Cubre también el commit de génesis sin necesidad de una excepción | `guard-rama.mjs` |
| `merge --no-ff` siempre | El commit de merge es la evidencia de haber pasado por la compuerta. Un fast-forward la borra | `docs/07-ingenieria/03-git.md` |

## Qué quedó pendiente

- [ ] **Crear repositorio remoto y configurar branch protection en GitHub antes del primer push**
- [ ] Integrar esta rama a `main` con `/integrar`

## Qué aprendimos

**La versión anterior de las convenciones era una intención, no una decisión.** Decía
*«trunk-based, `main` siempre desplegable»* sin ningún mecanismo que lo hiciera cumplir. Una regla
sin dientes no es una regla: es una aspiración que se abandona el primer viernes con prisa.

**La discusión no era sobre ramas, era sobre dónde está la compuerta.** El modelo de ramas elegido
y un *trunk-based* convencional son casi idénticos. Lo que cambió es que ahora hay un responsable
(`integrador`), un procedimiento de siete etapas, y mecanismos que lo verifican.

**Una sola puerta es mejor que una regla con excepciones.** El primer diseño prohibía el commit en
`main` de forma absoluta y exigía autorización solo para merge y push. Eso dejaba sin resolver el
commit de génesis y habría obligado a una excepción especial. Unificar las tres operaciones bajo la
misma autorización resultó más simple y más estricto a la vez.

**Hay que decir hasta dónde llega una protección.** Los hooks locales son una barandilla contra el
accidente y el atajo cómodo; **no son seguridad**. Un agente decidido puede crear el marcador. La
protección real es la de servidor, y mientras no exista el remoto la regla R11 depende de
disciplina. Presentarlo como un muro habría generado una falsa confianza peor que no tener nada.

**La compuerta se probó, no se declaró.** Se intentó un segundo commit en `main` sin autorización y
fue rechazado; se intentó un `push --force` y fue rechazado. Una protección sin probar está
declarada, no configurada.
