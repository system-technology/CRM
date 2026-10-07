# Traspaso — Bandeja de conversaciones · Antigravity

| Campo | Valor |
|---|---|
| Fecha | 2026-10-07 |
| Destinatario | Google Antigravity |
| Rama de trabajo | `feat/bandeja-web` |
| Base | `main`, tras integrar `feat/contratos-inbox` |
| Devuelve a | Claude Opus 5, que coordina |

---

## 1. Qué es este proyecto

**ViajaPro** es un CRM para agencias de turismo con WhatsApp como canal nativo. Es
**multi-tenant**: muchas agencias sobre la misma base de datos, aisladas por Row Level Security.

Lee **`AGENTS.md`** en la raíz antes de nada. Son trece reglas y no son decorativas: varias se
escribieron después de romperlas.

Stack de la parte que te toca: **Next.js 15 (App Router) + React + Tailwind 4 + TypeScript
estricto**. Gestor: `pnpm`.

## 2. La tarea

**Construir la bandeja de conversaciones en `apps/web`.** Es la pantalla donde un asesor de
agencia pasa su jornada: ve las conversaciones de WhatsApp entrantes, responde, asigna y cierra.

**Contra datos simulados.** La API todavía no existe — la estoy construyendo en paralelo. Tú
trabajas contra los contratos de `@viajapro/contracts`, que ya están escritos y son la frontera
entre los dos lados.

### Pantallas

1. **Lista de conversaciones** (`/bandeja`) — la fila es `ConversacionResumen`. Filtros:
   todas, mías, sin asignar, sin leer, SLA vencido. Búsqueda. Paginación por cursor.
2. **Conversación abierta** (`/bandeja/[id]`) — historial de mensajes, caja de redacción,
   asignación, notas internas.

## 3. Entradas

| Qué | Dónde |
|---|---|
| **Los contratos. Tu única fuente de verdad** | `packages/contracts/src/inbox.ts` |
| Diseño generado de la bandeja | `docs/_assets/diseno/01-bandeja.png` |
| Principios de diseño y tokens | `docs/01-producto/06-diseno-y-ux.md` |
| Tokens ya implementados | `apps/web/src/app/globals.css` |
| Pantalla de referencia ya hecha | `apps/web/src/app/cotizador/page.tsx` |
| Vocabulario del dominio | `docs/01-producto/02-lenguaje-ubicuo.md` |

## 4. Criterios de aceptación

Objetivos y comprobables. Si alguno no se cumple, el trabajo vuelve.

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm format:check` en verde.
- [ ] **Cero tipos redefinidos.** Todo lo que viaje por la frontera se importa de
      `@viajapro/contracts`. Si falta un campo, **se pide; no se inventa en la web**.
- [ ] La lista aguanta **500 conversaciones** sin que el desplazamiento se note. Verifícalo en
      navegador, con datos simulados de ese tamaño.
- [ ] **La ventana de 24 horas se ve antes de escribir, no después de fallar.** Si está cerrada,
      la caja de texto libre está deshabilitada y se explica por qué.
- [ ] **Las notas internas no se pueden confundir con un mensaje al cliente**, ni de un vistazo
      rápido ni por accidente al enviarlas.
- [ ] Un SLA vencido se distingue a simple vista; a menos de una hora, también.
- [ ] Un mensaje `FALLIDO` muestra por qué falló, no solo un icono.
- [ ] Funciona a **390 px de ancho**. Un asesor usa el móvil.
- [ ] Teclado: navegar la lista y enviar sin tocar el ratón.
- [ ] Los datos simulados viven en un solo archivo, fácil de borrar cuando llegue la API.

## 5. Restricciones innegociables

1. **Solo tocas `apps/web/`.** Nada más. En concreto, **no toques**
   `packages/database/`, `apps/api/`, `packages/contracts/`, `prisma/`, ni ningún archivo con
   `tenant_id`, política RLS o credenciales. No es desconfianza: es que ese código está bajo
   auditoría de seguridad y cualquier cambio ahí invalida dos informes.
2. **Rama propia: `feat/bandeja-web`.** Nunca escribas en `main`. En este proyecto solo un agente
   integra, y pasa por siete compuertas.
3. **No toques `ESTADO.md`.** El hilo del proyecto tiene un solo dueño o se rompe — ya pasó dos
   veces hoy.
4. **Ningún secreto en el repositorio.** Si necesitas una variable, va a `.env.example` vacía.
5. **El dinero no se calcula en la web.** Si alguna vez muestras un importe, viene formateado del
   servidor. Nunca `float`, nunca aritmética de precios en el cliente.
6. **Conventional Commits.** Ámbito `web`. Hay un hook que rechaza lo que no cumpla.

## 6. Qué NO debe hacer

- No inventes endpoints ni «ajustes» al contrato. Si algo no encaja, **páralo y dilo**: que el
  contrato esté mal es información valiosa, y cambiarlo por tu cuenta rompe al otro lado.
- No añadas dependencias sin justificarlo. Cada una es deuda.
- No instales librerías de componentes nuevas: ya hay Tailwind 4 y tokens definidos.
- No «mejores» los tokens de diseño ni la tipografía. La densidad es deliberada: el cuerpo es de
  13 px porque cada píxel de alto de fila es una conversación menos visible.

## 7. Formato de entrega

Commits en `feat/bandeja-web`, empujada a origin. Y un resumen con:

- Qué construiste y qué decidiste **que el encargo no especificaba** — eso es lo que nadie ha
  revisado y lo que más nos interesa.
- **Qué verificaste ejecutando y qué no.** Decir «no lo probé» es una respuesta aceptable;
  decir que funciona sin haberlo abierto, no.
- Capturas o grabación de la verificación en navegador, con las 500 conversaciones.
- Cualquier punto donde el contrato te pareciera incompleto o equivocado.

## 8. Cómo verificaremos

Tu trabajo pasa por **la misma compuerta que el nuestro**: procedencia, `lint`, `typecheck`,
`test`, `build`, fronteras entre módulos, secretos, y coherencia documental. Más revisión de
`auditor-codigo` y verificación en navegador por nuestra parte.

No se integra «porque lo hizo otra IA». Se integra si pasa.

---

## Por qué esta tarea y no otra

Se eligió por cuatro propiedades, y conviene que las conozcas porque explican los límites:

- **Independiente**: no comparte un solo archivo con el webhook que construimos en paralelo.
- **Contrato cerrado**: la frontera está escrita y es verificable por tipos.
- **Visual**: se comprueba manejando un navegador, que es donde eres mejor que nosotros.
- **No toca aislamiento entre tenants**, que es la única parte del sistema donde un fallo no se
  arregla después.
