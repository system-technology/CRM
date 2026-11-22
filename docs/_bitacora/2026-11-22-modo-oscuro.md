# 2026-11-22 — El modo oscuro desaparece al hidratar (T-586)

## Pregunta que decidía la prioridad

¿Pasa también en producción? **Sí.** Medido con `next build` + `next start` (Chromium, `?demo=1`,
`localStorage viajapro_tema=dark` y `colorScheme: dark`): en toda pantalla del marco `(app)` en modo
demostración (`/bandeja`, `/contactos`, `/viajes`, `/`) `<html>` termina sin la clase `dark`. En
`/ingresar`, `/privacidad` y 404 la clase se queda. No era solo de `next dev`: mismo comportamiento.

## Causa (medida, no supuesta)

Un `MutationObserver` sobre `<html>` mostró: el script del `<head>` añade `dark` (~180 ms) y ~800 ms
después la clase se borra. En ese instante aparece el error de hidratación (React 418 en producción).
Al fallar la hidratación, React regenera el documento en el cliente y vacía los atributos de `<html>`;
da igual que `<html>` no lleve `className` (se probó quitándolo y no cambió nada).

El desajuste concreto de las pantallas demo: `BarraModulos` pinta el botón `selector-vista-demo` solo en
el cliente (`esDemo` se lee de `?demo=1`/`localStorage` en el primer render, el servidor no lo sabe).

## Descartado

- CSP/nonce: el script del tema sí ejecuta (en producción llegan `data-tema*` a `<html>`), la consola no
  muestra ningún error de CSP.
- Falta de control: existe `ConmutadorDeTema` (Claro/Oscuro/Sistema), en la barra de módulos y el pie.

## Arreglo

`SincronizarTema` (cliente, en `layout.tsx`): un efecto reaplica el tema guardado al montar. Tras una
regeneración por hidratación el efecto corre de nuevo y repone `dark`. Además sigue al sistema en modo
«Sistema». Prueba unitaria: `sincronizar-tema.spec.tsx`. Verificado en producción tras el cambio:
`dark` presente en todas las rutas y en la navegación por cliente.

## Pendiente (cola)

- El desajuste de hidratación de las pantallas demo sigue ahí (cuesta una re-renderización completa del
  marco en cada carga demo): `esDemo` debe resolverse tras el montaje, no en el primer render.
- Si la aplicación real (no demo) hidrata limpia no se pudo medir: no hay API ni Postgres en este entorno.
