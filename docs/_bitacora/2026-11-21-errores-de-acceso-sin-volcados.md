# 2026-11-21 — La pantalla de ingreso deja de poder enseñar un volcado del servidor

El propietario abrió el staging y la pantalla de ingreso le mostró esto, tal cual, dentro de la
caja roja de «Error de autenticación»:

```
[ { "validation": "email", "code": "invalid_string", "message": "Invalid email",
    "path": [ "correo" ] }, { "code": "too_small", "minimum": 1, ... "path": [ "contrasena" ] } ]
```

## Dos cosas distintas, y conviene no confundirlas

**1. Lo que vio era código viejo.** El error valida `correo` como email, y el esquema de `main`
**ya no** lo hace desde que el ingreso acepta correo *o* usuario. El despliegue de staging llevaba
días congelado porque el workflow `deploy-staging` fallaba en cada merge por falta de secretos. Eso
se resolvió aparte, el mismo día.

**2. Pero el mecanismo que dejó pasar ese JSON seguía en `main`.** Y eso es lo que arregla este
cambio. En `apps/web/src/lib/auth-api.ts`, el `default` de `mapearErrorAcceso` devolvía el `message`
del servidor **tal cual**:

```ts
default:
  return mensajeFallback || 'Ocurrió un error al verificar tus credenciales. Intenta nuevamente.';
```

Hoy no se nota, porque el `ZodValidationPipe` de la API devuelve una frase humana y los fallos
campo por campo en `details`. Pero la web no lo sabía: pintaba lo que llegara. Bastaba un endpoint
que devolviera cualquier otra cosa para repetir la escena.

## La causa real: el volcado no venía de la API

El primer diagnóstico fue incompleto y conviene dejarlo escrito, porque la corrección vino de una
segunda captura. Tras desplegar staging con `main`, **el volcado seguía apareciendo** — pero ahora
con `path: ["identificador"]`, un campo que **solo existe en el código de hoy**. Es decir: no era
código viejo.

El volcado **lo produce la web, no la API**. `iniciarSesionApi` valida la entrada en el navegador
con el esquema compartido (`EsquemaIniciarSesion.parse`). Con los campos vacíos eso lanza un
`ZodError`, y **`ZodError.message` es el JSON de los `issues`**. El formulario lo recogía con
`catch (err) { setError((err as AuthApiError).message) }`, creyendo que siempre recibía un
`AuthApiError`. Ese error **nunca pasaba por `mapearErrorAcceso`**.

La API estaba bien desde el principio: su `ZodValidationPipe` devuelve `ENTRADA_INVALIDA` con los
fallos campo por campo.

## Qué cambia

- **El mensaje del servidor solo pasa si parece una frase.** Si empieza por `[` o `{`, o contiene
  `"code"`, `"path"` o `"validation"`, se usa el genérico. La prueba usa **el volcado literal que
  se vio en pantalla** y exige que ni `validation`, ni `invalid_string`, ni `path` lleguen al texto.
- **`ENTRADA_INVALIDA` pasa a estar mapeado**, y usa los `details` que la API ya enviaba. El pipe
  los manda precisamente por esto, y su comentario lo dice: «un "datos inválidos" a secas obliga al
  asesor a adivinar cuál de los ocho campos del formulario está mal». Ahora la web dice
  «Revisa la contraseña e intenta de nuevo», o «Revisa el correo o usuario y la contraseña».
- Los nombres de campo se traducen a cómo se llaman **en la pantalla**, no en el contrato.
- **`validarEntrada` convierte el `ZodError` del cliente en un `AuthApiError`** con mensaje humano
  y `details` por campo. Es el arreglo de la causa real.
- **`mensajeDeErrorDeAcceso`** es defensa en profundidad: la pantalla deja de leer `err.message` a
  mano. Un fallo de red o un `TypeError` inesperado tampoco pueden pintarse en crudo.

## Lo que no se hizo

No se tocó la API: su error ya era correcto, y lo era desde antes. El problema estaba entero en la
web, en dos capas: una validación de cliente cuyo error escapaba sin traducir, y un formulario que
pintaba `err.message` sin mirar qué era.

**Lección de método:** la primera hipótesis («es código viejo») explicaba la captura y era falsa en
lo esencial. Lo que la tumbó fue un detalle de la segunda captura —`path: ["identificador"]`, un
campo que solo existe hoy—, no un razonamiento. Conviene buscar en el error el dato que permita
fechar el código antes de dar por buena la explicación cómoda.

## Sin verificar

Las pruebas **no se corrieron en local**: este contenedor no tiene `node_modules` instalados. Las
corre el CI.
