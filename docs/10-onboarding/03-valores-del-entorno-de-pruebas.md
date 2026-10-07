# Valores del entorno de pruebas de Meta

> **Qué es esto.** Los identificadores de nuestra app de Meta y del número de prueba, para que
> ninguna sesión futura tenga que volver a preguntárselos al propietario.
>
> **Qué NO es.** Aquí no entra ningún secreto. Los tokens y el App Secret viven en `.env`, que
> está fuera del repositorio (regla R6). Si alguna vez aparece una credencial en este archivo, el
> arreglo no es borrarla: es **rotarla**.

**Estado: provisional.** La app está creada bajo un portafolio personal mientras se constituye la
empresa definitiva. Ver `02-alta-como-tech-provider.md`.

---

## Identificadores

| Dato | Valor | Variable en `.env` |
|---|---|---|
| **App ID** | `1968557404100610` | `META_APP_ID` |
| **Número de prueba** | `+1 555 638-9264` | — |
| **Phone Number ID** del número de prueba | `1468816839639661` | `META_PHONE_NUMBER_ID_PRUEBA` |
| **WABA ID** de la cuenta de prueba | `1152989873960143` | `META_WABA_ID_PRUEBA` |

**El App ID no es un secreto**: viaja en el navegador, dentro del SDK de Embedded Signup, y
cualquiera que abra la pantalla de conexión lo ve. El App Secret sí lo es, y no está aquí.

La jerarquía importa, porque es la misma que implementa el esquema del ADR-0008:

```
App ID          una, nuestra, para toda la plataforma
  └── WABA ID       una por agencia cliente
        └── Phone Number ID   uno o varios por agencia
```

## Qué funciona hoy, verificado

- **2026-10-07.** Mensaje de plantilla enviado desde la consola de Meta al móvil del propietario,
  recibido. La cadena app → Meta → teléfono real está viva.

## Límites del número de prueba

- **Cinco destinatarios como máximo**, registrados a mano y verificados por código.
- No requiere medio de pago ni verificación del negocio.
- **No sirve para clientes reales.** Para eso hace falta el número propio de cada agencia, que
  llega por Embedded Signup y depende de la verificación.

## Lo que todavía no existe

| Qué | De qué depende |
|---|---|
| **Token de usuario del sistema** (permanente) | Hoy solo hay uno temporal de 24 h |
| `META_APP_SECRET` | Pendiente de decidir dónde se despliega |
| `META_CONFIG_ID` del Embedded Signup | De la verificación del negocio |
| URL pública del webhook | De tener un entorno desplegado |
