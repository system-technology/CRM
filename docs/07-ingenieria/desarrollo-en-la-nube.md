# Desarrollo en la nube (GitHub Codespaces)

Para quien no tiene Docker en su maquina: el contenedor corre en GitHub y se usa desde el
navegador o desde VS Code. Levanta Node 22, pnpm, Postgres 16, Redis 7 y Mailpit.

> **Estado de verificacion (2026-11-04).** Esta configuracion se escribio sin poder crear un
> Codespace ni ejecutar Docker: nunca se ha arrancado. Y las cifras de costo de abajo vienen
> de memoria del autor, **NO VERIFICADO** contra la documentacion oficial (la sesion no tenia
> acceso a la web). Antes de depender de ellas, leer las paginas enlazadas en la seccion
> "Costo". Ver "Que no esta probado".

## Pasos

1. En GitHub, repositorio `system-technology/CRM` -> **Code** -> **Codespaces** -> **Create
   codespace on main** (o sobre la rama que se quiera). Elegir la maquina de 2 nucleos.
2. Antes o despues de crearlo, cargar los secretos opcionales (siguiente seccion).
3. Esperar a que termine `postCreateCommand` (`.devcontainer/post-create.sh`: instala con
   `pnpm install --frozen-lockfile`, genera Prisma y compila `domain`, `contracts` y `database`).
4. En la terminal del Codespace: `pnpm dev:nube`.
5. Abrir la pestana **Ports** de VS Code: el puerto 3000 es la web, el 8025 es Mailpit. El
   script imprime al final el usuario `dueno@agenciademo.test` y su clave de desarrollo.

`pnpm dev:nube` hace, en orden: genera `.env` (fuera de git) -> `db:migrate:deploy` ->
`roles:dev` -> `db:seed` -> `identidad:sembrar-dev` -> arranca api (3333) y web (3000). La
semilla solo se aplica la primera vez; `--resembrar` la repite y `--solo-preparar` no arranca
los servidores.

## Secretos (R6)

Nada sensible esta en el repositorio. Cargar en GitHub -> **Settings -> Codespaces -> Secrets**
(del usuario, con acceso al repositorio) cualquiera de estos nombres; todos son opcionales:

| Secreto                         | Para que                                                      |
| ------------------------------- | ------------------------------------------------------------- |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Cadena que tambien se pega en el panel de Meta                |
| `META_APP_SECRET`               | Verificar la firma de los webhooks                            |
| `META_APP_ID`                   | App de Meta                                                   |
| `META_SYSTEM_USER_TOKEN`        | Token del usuario de sistema                                  |
| `META_PHONE_NUMBER_ID_PRUEBA`   | Numero de prueba de Meta                                      |
| `META_WABA_ID_PRUEBA`           | WABA de prueba                                                |
| `META_TENANT_ID_PRUEBA`         | Agencia duena del canal de prueba (lo imprime el script de canal) |
| `ANTHROPIC_API_KEY`             | Capacidades de IA                                             |

Lo demas (`BETTER_AUTH_SECRET`, claves de cifrado, contrasenas de los roles) se **genera al
azar** la primera vez y queda en `.env`, que git ignora. La unica clave fija es la del Postgres
del contenedor (`viajapro`), igual a la de `infra/docker`: la base solo existe dentro del
contenedor y no es alcanzable desde fuera salvo que se publique el puerto 5432, cosa que no se
hace aqui.

## Exponer el webhook de Meta sin tunel

1. En **Ports**, clic derecho sobre el 3333 -> **Port Visibility** -> **Public**.
2. URL de callback en Meta: `https://<nombre-del-codespace>-3333.app.github.dev/webhooks/whatsapp`
   (el script la imprime con el dominio real del Codespace). Verify token: el de arriba.
3. Cuando termine la prueba, volver el puerto a **Private**.

Riesgos de dejarlo publico:

- Cualquiera con la URL llega a **toda** la API, no solo al webhook. Defensas que ya existen:
  autenticacion por sesion, RLS, limite de tasa y firma HMAC del webhook (que exige
  `META_APP_SECRET` cargado; sin el, el webhook no se puede validar).
- La URL cambia si se crea otro Codespace y hay que actualizarla en Meta.
- Solo datos sinteticos en esta base: **nunca** cargar datos reales de clientes (CLAUDE.md,
  entornos). Un Codespace no es produccion ni staging.
- Una organizacion puede prohibir la visibilidad publica por politica; si la opcion no
  aparece, es eso (NO VERIFICADO).
- Con la web en 3000 privada y la API en 3333, el navegador llama de un origen a otro: si el
  puerto 3333 sigue privado, GitHub exige su cookie de reenvio y las llamadas pueden fallar
  por CORS. Para probar el flujo web completo hace falta el 3333 publico, o abrir ambas URLs
  autenticadas en el mismo navegador (NO PROBADO).

## Costo y como evitar gasto

Fuentes oficiales a leer antes de fiarse (NO VERIFICADO, no se pudieron abrir):

- <https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces>
- <https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces>
- <https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace>

Lo que el autor recuerda, y por tanto hay que contrastar: cuentas personales con una cuota
mensual gratuita de horas de nucleo (120 en Free, que serian 60 horas reales en una maquina de
2 nucleos) y 15 GB-mes de almacenamiento; un Codespace de una **organizacion** factura a la
organizacion sin cuota gratuita personal; inactividad por defecto de 30 minutos; pasada la
cuota, se cobra por uso solo si hay limite de gasto configurado.

Como no gastar, sea cual sea la tarifa:

- **Detener** el Codespace al terminar (menu de Codespaces -> *Stop codespace*, o
  `gh codespace stop`). Detenido no consume horas de computo, pero sigue ocupando almacenamiento.
- **Borrarlo** cuando ya no se use (`gh codespace delete`): el almacenamiento tambien cuenta.
- Poner el limite de gasto en 0 USD en Billing para que nunca cobre sin avisar.
- Reducir el tiempo de inactividad en Settings -> Codespaces.
- Crearlo en la cuenta personal, no en la organizacion, mientras se mida el consumo.

## Alternativas (sin verificar)

No se pudo leer la documentacion oficial de ninguna; solo es orientacion.

| Opcion                           | Para que sirve                                                  | Estado de la lectura |
| -------------------------------- | --------------------------------------------------------------- | -------------------- |
| Gitpod / Ona                     | Entorno en la nube parecido a Codespaces                        | NO VERIFICADO (cuota y condiciones) |
| GitHub Actions                   | Entorno **efimero** de prueba: `ci.yml` ya levanta Postgres y Redis como servicios. Sirve para correr pruebas, no para desarrollar interactivamente ni recibir webhooks | Conocido del repo; limites de minutos NO VERIFICADO |
| Docker Desktop local en Windows  | Todo en la maquina; requiere WSL2 y virtualizacion              | Licencia para empresas: **NO VERIFICADO**. Si el propietario trabaja en una empresa grande, revisar los terminos oficiales antes de instalarlo |

## Que no esta probado

- Que `devcontainer.json` y el compose arranquen en Codespaces (imagen
  `mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm`, redes compartidas con
  `network_mode: service:db`, montaje de `infra/docker/postgres/init`).
- `post-create.sh` y cada paso de `pnpm dev:nube` contra una base real: solo se verifico la
  sintaxis (JSON, `node --check`, `bash -n`, Prettier).
- Que la semilla sea reejecutable (por eso `--resembrar` es explicito).
- Cookies de sesion y CORS entre los puertos 3000 y 3333 de Codespaces.
- Que el API arranque con `REDIS_URL` presente y `COLA_CORREO=memoria`; el modo sin Redis del
  ADR-0019 (PR #200) hara innecesario el servicio Redis cuando se integre.
- `pnpm dev:nube` en Windows (usa `shell` para resolver `pnpm`), aunque su destino es Linux.
