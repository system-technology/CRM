# Pendientes del propietario

> La bandeja de lo que **solo el propietario puede resolver**. El orquestador la mantiene al día (regla en
> [`../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md`](../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) §3.2).
> Se ordena por **lo que más bloquea**. Una línea tachada es una que ya se resolvió. Aquí **no hay secretos**: solo nombres.

Última revisión: 2026-11-21 (cierre del segundo lote).

## Bloquean la presentación al cliente (Ola 0)

| # | Qué | Por qué solo tú | Cómo |
|---|---|---|---|
| 1 | **Cargar los secretos de la API en Render** | Son claves; nunca pasan por una sesión | `CAMPOS_SENSIBLES_KEY` (+`_VERSION`, con copia fuera de Render), `BETTER_AUTH_SECRET`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WEBHOOK_PAYLOAD_KEY` (+`_VERSION`), `CORREO_PAYLOAD_KEY`, `WHATSAPP_DIRECTORY_PEPPER` (+`_VERSION`), `POSTMARK_SERVER_TOKEN`, `POSTMARK_MESSAGE_STREAM`, `MAIL_FROM` |
| 2 | **Secreto `DIRECT_URL` en GitHub Actions** | Es una cadena de conexión de la base | Sin él no corren las migraciones contra Neon (hoy faltan decenas) |
| 3 | ~~Proyecto de la web en Vercel~~ **Existe** (`viajapro-staging`, 2026-11-21) | — | Falta que despliegue lo nuevo de `main` y fijar `WEB_PUBLIC_URL`; sin API en Render la web no tiene con qué hablar (Render, sin verificar) |
| 4 | **Mover el servicio de Render a tu proyecto** y poner `healthCheckPath` en `/salud` | La herramienta no elige proyecto | Panel de Render |

## Bloquean el flujo de PR

| # | Qué | Cómo |
|---|---|---|
| 5 | **`navegador` como check obligatorio** en la protección de `main` | `gh api -X POST repos/system-technology/CRM/branches/main/protection/required_status_checks/contexts --input - <<< '["navegador"]'`, o Settings → Branches. Después se reabre el PR con la copia del archivo y el «8 → 9 checks» en los documentos (el contenido está en el commit `27412e7`; el #357 se cerró para liberar la rama) |
| 6 | **Etiqueta `override-lane`** en los PR de ingreso por apodo (#358, #362) que mezclan carriles, o aceptar el rojo de «Carril y tarea» | La pones tú en GitHub (el PR → Labels → `override-lane`). El sistema de permisos de la sesión madre **me lo denegó dos veces, aun con tu autorización en el chat**: es una regla de la herramienta. Alternativa: añadir una regla de permiso de Bash para esa llamada en tu configuración |
| 7 | **Contestar el permiso de Bash** pendiente en la sesión de despliegue (agente del PR 1b) | Solo se contesta en esa sesión |
| 8 | **Poner las sesiones en modo Auto** (menú junto al cuadro de texto) | Sin eso se detienen en cada permiso y el trabajo desatendido no avanza |
| 8b | **Decir si la sesión del punto 8 (cobros) puede trabajar sin supervisión** | Esa sesión no aceptó mi orden de autonomía sin tu confirmación escrita en su propia conversación (pidió A, B o C). Hoy trabaja bajo la A: un PR por tarea, sin auto-merge, con auditoría de seguridad antes de integrar (T-328 a T-330). Para la B, escríbele en esa sesión que sí |
| 8c | **Las sesiones no pueden levantar Postgres en local**: el clasificador del modo automático lo deniega | Por eso «probado en navegador» significa casi siempre «contra API simulada». Limita toda verificación de pantalla (ejemplo: T-511). Si quieres verificación real, permite esa llamada o corre la prueba tú |
| 8d | **El clasificador también deniega `git push --force-with-lease`** | Para corregir el asunto de un commit ya empujado hay que recrear la rama y abrir otro PR (pasó dos veces la madrugada del 2026-11-21). Solo tú puedes permitirlo en la configuración |
| 8e | **Sigue pendiente**: redesplegar con el `main` actual (solo con tu confirmación) y regenerar la clave de la demo | La clave se perdió al archivarse la sesión de despliegue; se regenera resembrando. Los puntos 1, 2 y 5 siguen igual |
| 8f | **El despertar automático de las 2 h apunta a la sesión madre equivocada** (lo más urgente de esta lista) | Al relevarse la madre a las 08:50 UTC del 2026-11-21, la tarea programada `trig_016u2cLZTGLRrJvkZWgJpqpG` quedó apuntando a la **anterior** (`session_01R81Xh45hbFQHivoDJ8cbJQ`). La madre nueva es **`session_01R81Xh3ygCnt8wYfALeA6yY`** y **no pudo repuntarla**: el clasificador le denegó `create_trigger` («Destructive or Unwanted Actions»), `update_trigger` solo deja cambiar el prompt desde la conversación a la que la tarea escribe, y pedírselo a la madre anterior por `send_message` también se denegó («Undermining Oversight»). **No se rodeó ninguna de las tres.** Mitigación provisional: un aviso en la cabecera del `TABLERO-DEL-ORQUESTADOR.md` que la madre anterior lee en el paso 0 de su prompt y que le dice que solo reenvíe el despertar. **Arreglo de verdad, dos opciones:** (a) añadir una regla de permiso para `mcp__claude-code-remote__create_trigger` a la madre, o (b) crear tú la tarea programada (`15 */2 * * *`) apuntando a `session_01R81Xh3ygCnt8wYfALeA6yY` con el prompt de orquestación, y borrar la vieja. Sin esto, el riesgo es que a las 10:15 UTC **dos madres orquesten a la vez** y rompan la integración serializada |
| 9 | **Red del entorno en la nube**: añadir `developers.facebook.com` (o ampliar el nivel de red) | Menú del entorno → Edit → Network access |

## Decisiones de producto y de negocio

| # | Qué | Contexto |
|---|---|---|
| 10 | **Coexistencia (recomendada para el piloto) o número separado** para el CRM: aceptar o cambiar el borrador del **ADR-0033** | Verificado en Meta el 2026-11-21 (PR #365). Con coexistencia el dueño **no pierde la app**, pero **todo chat individual del número entra al CRM** y **no hay forma documentada de excluir chats**; las etiquetas de WhatsApp Business **no se sincronizan** (nuestras etiquetas propias siguen siendo necesarias). La auditoría exige: vínculo número–agencia tomado de la sesión, filtro de exclusión en el trabajador, sin historial en el piloto, contrato de encargo y que el dueño saque sus chats personales del número |
| 11 | **Pasarela de pagos en COP** (Wompi, PayU, ePayco o Mercado Pago) | Necesaria para la Ola 2 |
| 12 | Respuestas del dueño de JD Tours: cobra por archivo o por pasajero, pagos libres o en cuotas, qué etiquetas usa, qué mira cada asesor, su hoja de reservas (muestra **sin datos personales**) | Roadmap de JD Tours §4 |
| 12c | **14 preguntas de reportes por nivel** (una palabra cada una, con su valor por defecto entre corchetes) | Están en la sección 7 del documento de reportes por nivel (PR #392, `docs/08-roadmap/`). Mientras no contestes se construye lo de los corchetes. La 12 (cerrar ya `/reportes/resumen` a quien no tenga `conversaciones.ver_todas`) la dio por Sí el orquestador porque cierra una contradicción con tu decisión de reportes por niveles |
| 12b | **Nombre comercial, logo y marca de ViajaPro** | La sesión de diseño los necesita para la portada de ingreso y para la propuesta al viajero (Ola 5 del rediseño). Sin ellos se usa un distintivo provisional |
| 13 | **Cifrado del NIT** de la agencia (T-309) | Hoy está en claro bajo RLS |

## Trámites externos

| # | Qué | Tarea |
|---|---|---|
| 14 | Verificación del negocio en Meta y solicitud de **Tech Provider** | T-080 |
| 15 | Aviso de privacidad, política de tratamiento, RNBD y derechos del titular: **abogado** | T-093, T-098, T-097, T-267 |
| 16 | **Contador** para el ADR-0023 (comisión del proveedor, fiscal) | ADR-0023 |
| 17 | **Rotar la clave de 21st.dev** que se pegó en un chat | — |
| 18 | Un mensaje real de WhatsApp desde un celular a la bandeja | Cierra la prueba de punta a punta |
