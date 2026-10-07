# Convenciones de ingeniería

Lo que no se discute en cada revisión porque ya está decidido aquí.

---

## 1. Nombres

| Elemento | Forma | Ejemplo |
|---|---|---|
| Archivo | `kebab-case.ts` | `send-message.use-case.ts` |
| Clase, tipo, interfaz | `PascalCase` | `TravelFile`, `MessagingProvider` |
| Función, variable | `camelCase` | `calculateMarkup` |
| Constante | `SCREAMING_SNAKE` | `MAX_RETRY_ATTEMPTS` |
| Tabla y columna | `snake_case` | `travel_files`, `time_limit` |
| Evento de dominio | `PascalCase` en pasado | `QuoteSent`, nunca `SendQuote` |
| Cola BullMQ | `kebab-case` con contexto | `inbox:send-message` |
| Ruta HTTP | `kebab-case` plural | `/api/v1/travel-files` |

**Sufijos que significan algo:**
`.use-case.ts`, `.repository.ts`, `.controller.ts`, `.event.ts`, `.port.ts`, `.adapter.ts`,
`.spec.ts`, `.e2e-spec.ts`.

**El lenguaje ubicuo manda sobre todo lo anterior.** Si
[`docs/01-producto/02-lenguaje-ubicuo.md`](../01-producto/02-lenguaje-ubicuo.md) dice
`TravelFile`, no se escribe `Booking` aunque suene mejor.

---

## 2. Estructura de un módulo

```
modules/<contexto>/
├── domain/           Sin framework. Nada de @nestjs, nada de Prisma.
├── application/      Casos de uso. Reciben puertos por inyección.
├── infrastructure/   Adaptadores: repositorios, clientes HTTP, publicadores.
└── interface/        Controladores, gateways, consumidores de cola.
```

Dependencias hacia adentro: `interface` → `application` → `domain`.
`infrastructure` implementa interfaces de `domain`. **`domain` no importa de nadie.**

---

## 3. TypeScript

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,   // arr[0] es T | undefined. Es la verdad.
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true
}
```

- **`any` prohibido.** Si el tipo es desconocido: `unknown` + validación con Zod. Un `any` casi
  siempre indica que el modelo de datos está incompleto. El hook `PostToolUse` avisa.
- **Sin aserciones de tipo** (`as X`) salvo tras una validación en runtime que lo justifique.
- **Tipos derivados, no duplicados:** `type Quote = z.infer<typeof QuoteSchema>`.
- **Uniones discriminadas** para estados, no banderas booleanas sueltas.
- **Errores tipados:** `DomainError` y subclases. Nunca `throw new Error('algo falló')`.

---

## 4. Errores

```typescript
// Clases de dominio, con código estable y contexto.
export class ServiceWindowClosedError extends DomainError {
  readonly code = 'SERVICE_WINDOW_CLOSED';
  constructor(readonly conversationId: string, readonly closedAt: Date) {
    super('La ventana de servicio de 24 horas está cerrada');
  }
}
```

Reglas:

1. **Nunca un `catch` silencioso.** Si se atrapa, se maneja o se relanza con contexto.
2. **El filtro global traduce a HTTP.** Nada de `try/catch` por ruta repartiendo códigos de estado.
3. **Mensaje para el usuario y detalle para el log, separados.** El asesor ve qué hacer; el log
   tiene el porqué.
4. **Jamás un secreto en el mensaje de error.** Ni un token, ni una URL de conexión, ni un
   `Authorization`.
5. Los errores de terceros (Meta, pasarelas) se traducen a errores nuestros en el adaptador.
   El dominio no conoce los códigos de Meta.

---

## 5. Asincronía

- `async/await` siempre. Nada de cadenas de `.then()`.
- **Toda promesa se espera o se maneja.** El `await` olvidado es el bug más común y el más silencioso.
- `Promise.all` solo cuando un fallo parcial sea aceptable; si no, `Promise.allSettled` y manejo
  explícito de cada resultado.
- **Nunca una llamada de red dentro de una transacción de base de datos.** La transacción se cierra,
  y después se llama al tercero — por cola, no en línea.
- Todo efecto externo pasa por BullMQ, con reintento y backoff.

---

## 6. Base de datos

- Todo acceso por repositorio. Nunca Prisma directo en un caso de uso.
- Transacciones explícitas en el caso de uso, no escondidas en el repositorio.
- **`SET LOCAL app.current_tenant`**, nunca `SET`: el valor debe morir con la transacción, o
  contamina la siguiente conexión del pool.
- Paginación por cursor en listados que crecen; offset solo en catálogos acotados.
- Sin N+1: si hay un bucle con una consulta dentro, está mal.

---

## 7. API HTTP

```
GET    /api/v1/travel-files
POST   /api/v1/travel-files
GET    /api/v1/travel-files/:id
PATCH  /api/v1/travel-files/:id
```

- Versión en la ruta: `/api/v1/`.
- Validación de entrada con los esquemas Zod de `packages/contracts`. Sin excepción.
- Respuesta de error uniforme:
  ```json
  { "error": { "code": "SERVICE_WINDOW_CLOSED", "message": "...", "details": {} } }
  ```
- Paginación uniforme: `{ data: [...], pageInfo: { nextCursor, hasMore } }`.
- **El `tenant_id` nunca viaja en la petición.** Se deriva del token. Si aparece en un cuerpo o en
  una URL, es un hallazgo crítico de auditoría.
- Idempotencia en operaciones que producen efectos externos: cabecera `Idempotency-Key`.

---

## 8. Frontend

- Server Components por defecto. `"use client"` lo más abajo posible en el árbol.
- TanStack Query para estado de servidor. Nada de `useEffect` + `fetch`.
- Si el estado cabe en la URL, va en la URL. Zustand solo para estado de UI verdaderamente global.
- Formularios con react-hook-form + los esquemas Zod del contrato: **el mismo esquema valida en
  cliente y en servidor.**
- Los tres estados en toda vista: vacío, cargando, error. Esqueleto, no spinner.
- **Ninguna lógica de negocio en el cliente.** El cálculo de un markup es del servidor, siempre.

---

## 9. Comentarios

Comenta el **porqué**, nunca el qué.

```typescript
// Mal: suma los ítems
// Bien: Meta rechaza plantillas con más de 1024 caracteres en el cuerpo; truncamos
//       antes de enviar para que el fallo sea nuestro y legible, no de Meta y opaco.
```

Si el código necesita un comentario para entenderse, primero intenta reescribirlo.
Si no se puede —porque la complejidad es del dominio, no del código— entonces el comentario es
obligatorio y explica la regla de negocio.

---

## 10. Commits

[Conventional Commits](https://www.conventionalcommits.org/) con scope de contexto:

```
feat(quoting): calcula markup por tipo de pasajero
fix(inbox): evita duplicar mensajes cuando Meta reintenta el webhook
refactor(booking): extrae la validación de time limit al dominio
docs(adr): registra la decisión de monolito modular
```

Los scopes válidos están en `commitlint.config.js`. Un commit por cambio lógico; nada de
"varios arreglos".

---

## 11. Ramas

`main` es intocable: solo escribe el agente `integrador`, y solo tras superar las siete compuertas
(regla R11). Toda tarea empieza así:

```bash
git checkout main && git pull
git checkout -b feat/<contexto>-<descripción>
```

Ramas de 1 a 3 días. Si el trabajo es más largo, se parte: una funcionalidad grande son varias
ramas que integran por partes, no una rama de dos semanas.

Para integrar: `/integrar`. El modelo completo, las siete compuertas y los motivos de devolución
están en [git y ramas](03-git.md).
