# Diseño: identidad de servicio y `tenantCode` entre bot, Rag-API y container

**Fecha:** 2026-11-13
**Estado:** BORRADOR para aprobación. No hay plan ni código hasta que se apruebe.

Proyectos: `Rag-API` y `whatsapp-chat-bot-API` (alcance de esta iteración). `container.API` queda **fuera de alcance por ahora** (otro agente lo está modificando); se documenta aquí el contrato que se le pedirá.

## 1. Intención

Rag-API debe conocer el tenant de cada petición sin que el cliente pueda falsificarlo, tanto cuando llega un usuario del panel como cuando el bot responde un mensaje de WhatsApp (donde no hay ningún JWT de usuario). El tenant deja de ser un header libre (`X-Tenant-Id`) y pasa a ser un dato **firmado por container**.

## 2. Decisiones del usuario

- El tenant viaja como **`tenantCode`**: un código opaco, único y que nunca se repite (no el id numérico de container).
- `Tenant.code` en container pasa a ser **campo requerido, sin valor `default`** (lo hará el trabajo de container, ver §7).
- Cada despliegue del bot tiene su propia base de datos (un bot = un tenant).
- No es necesario ser puristas: el bot **sí puede llamar a container**, a través de un adaptador.
- Se avanza primero con Rag-API y el bot; container después.

## 3. Estado actual (lo encontrado)

- Rag-API y el bot ya verifican `Authorization: Bearer <jwt>` emitidos por container (`JwtAuth`, `JWT_PUBLIC_KEY`, guard global). Aud: `rag-api` en Rag-API y `whatsapp-chat-bot` en el bot.
- Rag-API **ya no tiene `ApiKeyGuard`**, pero el adaptador del bot (`rag-knowledge.service.ts`) todavía envía `X-API-Key`, sin `Authorization`. Hoy el bot recibe 401 de Rag-API en todas sus llamadas.
- Rag-API lee el tenant del header `X-Tenant-Id` (`@TenantId()`); `JwtAuth.validate` solo comprueba que exista `sub` y devuelve `true`.
- El tenant de la colección se guarda en `Collection.tenantId` (columna `tenantId`, único `(tenantId, name)`).
- El bot usa la constante `TENANT_ID` (`'default'`) para el webhook y exige el header `X-Tenant-Id` en `/admin/knowledge`.

## 4. Diseño

### 4.1 Contrato de identidad

- **Claim `tenantCode`** (string, `^[a-z0-9][a-z0-9_-]{0,62}$`) en todo JWT que container emita para Rag-API: tokens de usuario y tokens de servicio.
- Los tokens de servicio añaden `sub: service:<nombre>` y un claim `typ: 'service'`; los de usuario no lo llevan.
- Rag-API toma el tenant **solo** del claim del token ya verificado. Un token sin `tenantCode` válido se rechaza con 401. El header `X-Tenant-Id` deja de existir (sin período de transición: no hay consumidores externos todavía).

### 4.2 Rag-API

- `JwtAuth.validate` devuelve un *principal* `{ sub, tenantCode, isService }` y rechaza (devuelve `null`/`false`) si falta o es inválido `tenantCode`.
- El decorador `@TenantId()` se reemplaza por `@TenantCode()`, que lee el principal validado del request (cómo lo expone `@nestjs/authentication` lo resuelve quien construya).
- `Collection.tenantId` → **`tenantCode`** (entidad, schema, puerto, repositorio y servicios) para no confundirlo con el id numérico de container. Migración nueva que renombra la columna y el único `UQ_Collection_tenantId_name` → `UQ_Collection_tenantCode_name`; no mueve datos.
- Se eliminan `X-Tenant-Id` de los `@ApiHeader` y del OpenAPI; queda `@ApiBearerAuth()`.
- Colección por defecto `qwen` por tenant, sin cambios.

### 4.3 Bot

- **Puertos de dominio** (`core/domain/ports/`):
  - `TenantIdentityPort`: `getTenantCode(): Promise<string>`.
  - `ServiceTokenPort`: `getToken(): Promise<string>`.
- **Adaptador** `ContainerIdentityAdapter` (`infrastructure/extern/container/`):
  - Tenant: `GET {CONTAINER_API_URL}/tenant` (público, ya existe) → campo `code`. Se cachea en memoria, sin caducidad (el código es inmutable).
  - Token: `POST {CONTAINER_API_URL}/auth/service-token` con `{ clientId, clientSecret }` → `{ accessToken, expiresIn }` (contrato a crear en container, §7).
  - Caché en memoria del token; se renueva cuando faltan menos de 5 minutos para expirar. Un solo refresco en curso a la vez (las demás llamadas esperan el mismo). Si container falla: reintentos con espera creciente y se sigue usando el token vigente hasta que expire.
  - Variables de entorno: `CONTAINER_API_URL`, `CONTAINER_CLIENT_ID`, `CONTAINER_CLIENT_SECRET`. Se elimina `RAG_API_KEY`.
- `RagKnowledgeService` envía `Authorization: Bearer <token>` obtenido de `ServiceTokenPort`; deja de enviar `X-API-Key` y `X-Tenant-Id`.
- `KnowledgePort` **vuelve a no recibir tenant** (`list()`, `uploadFile(file)`, `search(query)`, …): el tenant viaja dentro del token. Se elimina la constante `TENANT_ID` y el decorador `@TenantId()`.
- `/admin/*`: el JWT del usuario (aud del bot) lleva `tenantCode`; un guard comprueba que coincide con `TenantIdentityPort.getTenantCode()` y responde 403 si no. El bot llama a Rag-API siempre con **su** token de servicio, no con el del usuario.
- Degradación (igual que hoy): si el bot no consigue token o container no responde, `searchKnowledgeSafely` registra el fallo y la respuesta sale sin conocimiento; el arranque no depende de container.
- No se toca la `audience` ni el `realm` que el usuario puso en el `JwtAuth` del bot.

## 5. Goals / non-goals

**Objetivos:** el tenant sale de una identidad firmada; no hay rotación manual de credenciales; el bot no maneja ningún string de tenant escrito a mano; un solo mecanismo de autenticación en Rag-API.

**No-objetivos:** proyecto de administración / aprovisionamiento; revocación inmediata de tokens (los de servicio duran 1 h); JWKS/`kid`; la lógica del negocio del bot; el historial de mensajes (sin cambios).

**Anti-objetivo:** que un cliente pueda elegir su tenant mediante un header, aun con un token válido.

## 6. Pruebas

- Solo unitarias con mocks más pruebas de integración/e2e escritas pero **no ejecutadas** (regla del usuario: ningún test que dependa de Docker). Los tokens de prueba se firman con un par RSA generado en el test.
- Casos clave: `JwtAuth` rechaza token sin `tenantCode` o inválido; dos tenants no ven los datos del otro con tokens distintos; el bot renueva antes de expirar y comparte un único refresco entre llamadas concurrentes; el bot sigue respondiendo si container no está; `/admin/*` da 403 con `tenantCode` ajeno.

## 7. Contrato que se pedirá a container (fuera de esta iteración)

1. `Tenant.code` **requerido**, sin `'default'`: lo toma de la variable `TENANT_CODE` en la migración inicial (como `SEED_ADMIN_*`), único, inmutable, generado por el aprovisionamiento con un sufijo aleatorio (p. ej. `acme-7k3m9x2q`).
2. Claim `tenantCode` en los JWT de usuario.
3. Clientes de servicio y `POST /auth/service-token` (client credentials → JWT de 1 h con `aud: rag-api`, `tenantCode`, `typ: service`).
4. `GET /tenant` sigue devolviendo `code`.

Hasta que container lo entregue no hay integración real entre los tres; las pruebas usan tokens firmados localmente.

## 8. Mis llamadas (para revisar)

- Sin período de transición con el header; corte limpio.
- Renombrar `tenantId` → `tenantCode` en Rag-API con una migración nueva (no se edita la ya escrita, por si alguna base la aplicó).
- El bot usa siempre su propio token de servicio hacia Rag-API, incluso para peticiones del panel.
- Renovación a 5 minutos del vencimiento y TTL de 1 h.

## 9. Riesgos

- Ambos repos tienen cambios sin commitear en curso (reestructura a `infrastructure/modules/`); la implementación debe leer el estado vigente antes de editar.
- El bot pasa a depender de dos endpoints de container; hay que versionar su contrato.
- Revocación limitada a la duración del token (1 h).
