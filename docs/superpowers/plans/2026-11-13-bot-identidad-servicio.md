# Bot: identidad de servicio y tenant desde container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bot obtiene de container su `tenantCode` y un token de servicio renovable, llama a Rag-API solo con `Authorization: Bearer` (sin `X-API-Key` ni `X-Tenant-Id`) y comprueba que el tenant de los usuarios del panel es el suyo.

**Architecture:** Dos puertos de dominio (`TenantIdentityPort`, `ServiceTokenPort`) con un único adaptador HTTP hacia container (`ContainerIdentityService`) que cachea el tenant y el token en memoria, renueva el token 5 minutos antes de que expire con un solo refresco concurrente y reintenta con espera creciente. `KnowledgePort` vuelve a no recibir tenant. Un guard compara el claim `tenantCode` del usuario con el del bot en `/admin/*`.

**Tech Stack:** NestJS 12 (ESM), `@nestjs/axios`, `@nestjs/authentication ^0.1.5`, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-13-auth-servicio-tenant-code-design.md` (§4.3, §6, §7). Repo: `what-app/whatsapp-chat-bot-API`. Se aplica **después** de `2026-11-13-rag-api-tenant-code.md`.

## Global Constraints

- **Contrato asumido de container** (aún no implementado, ver spec §7): `GET {CONTAINER_API_URL}/tenant` → `{ code: string, ... }` (público); `POST {CONTAINER_API_URL}/auth/service-token` con cuerpo `{ clientId: string, clientSecret: string }` → `{ accessToken: string, expiresIn: number }` (`expiresIn` en segundos). Se cambia solo en el adaptador si container lo ajusta.
- Variables de entorno nuevas: `CONTAINER_API_URL`, `CONTAINER_CLIENT_ID`, `CONTAINER_CLIENT_SECRET`. Se elimina `RAG_API_KEY`. El `client_secret` y el token **nunca** se registran en logs.
- Renovación: `RENEW_MARGIN_MS = 5 * 60 * 1000`; reintentos: 3 intentos con espera `500 ms * 2^(intento-1)`; si el refresco falla y el token en caché aún no expiró se sigue usando; si no hay token vigente, `ServiceUnavailableException('No se pudo obtener el token de servicio.')`. El tenant se cachea sin caducidad (el código es inmutable).
- `KnowledgePort` sin parámetro de tenant: `list()`, `uploadFile(file)`, `createNote(input)`, `updateNote(id, input)`, `remove(id)`, `search(query)`. Se eliminan `TENANT_ID`, `TENANT_ID_PATTERN` y el decorador `@TenantId()`; se conserva `KNOWLEDGE_COLLECTION = 'qwen'`.
- `/admin/*` (conocimiento e instrucciones): el principal del `JwtAuth` es `{ sub, tenantCode }`; el guard responde 403 si `tenantCode` ≠ el del bot. El bot llama a Rag-API siempre con **su** token de servicio, no con el del usuario.
- El `JwtAuth` del bot conserva `issuer`, `audience: 'whatsapp-chat-bot'` y `realm: 'store'`: **solo se cambia `validate`**.
- Degradación: si container o Rag-API fallan, `searchKnowledgeSafely` registra el error y el bot responde sin conocimiento; el arranque no depende de container (no se llama a container en `onModuleInit`).
- Reglas del usuario: **desarrollo primero, tests al final** (Task 5); **no levantar contenedores ni ejecutar tests que dependan de Docker** (los e2e se actualizan pero no se corren); no hacer commit hasta que el usuario lo pida y sin `Co-Authored-By`.
- El árbol tiene cambios sin commitear del usuario: leer el estado vigente de cada archivo antes de editar y no revertir nada ajeno. `X-API-Key` en `whats-app-proxy.service.ts` es de YCloud: **no se toca**.
- Imports con `.js`; 4 espacios en `src/`, 2 en los specs.

## Review Focus

- Container caído al primer mensaje: el bot responde sin conocimiento y no lanza un rechazo sin manejar; al volver container, el siguiente mensaje usa conocimiento.
- Varios webhooks a la vez con el token vencido o por vencer comparten **una** petición a container.
- `expiresIn` ausente, no numérico o ≤ 0 → el token se descarta (no se cachea como eterno).
- `/admin/*` con un JWT de otro `tenantCode` → 403 sin llamar a Rag-API; con el mismo → pasa.
- El secreto y el token no aparecen en ningún mensaje de log ni de error.

## File Structure

- Create: `core/domain/ports/tenant-identity-port/tenant-identity.port.ts`, `core/domain/ports/service-token-port/service-token.port.ts`, `infrastructure/extern/container/container-identity.service.ts`, `infrastructure/modules/container/container.module.ts`, `controller/guards/tenant-match.guard.ts`.
- Modify: `knowledge.port.ts`, `rag-knowledge.service.ts`, `rag.module.ts`, `whats-app-message.service.ts`, `admin-knowledge.controller.ts`, `admin-instructions.controller.ts`, `admin.module.ts`, `infrastructure/extern/auth/jwt-auth/jwt-auth.ts`, `core/domain/tenant.ts`, `.env.example`, `docker-compose.yml`, `CLAUDE_CONTEXT.md`, `docs/flow.md`, `../CLAUDE.md`, specs.
- Delete: `controller/decorators/tenant-id.decorator.ts` y su spec.
- Rutas relativas a `src/` salvo las de docs/config.

---

### Task 1: Puertos y adaptador de container

**Files:** Create los puertos, `container-identity.service.ts`, `container.module.ts`

**Interfaces:**
- Produces: `abstract class TenantIdentityPort { abstract getTenantCode(): Promise<string> }`; `abstract class ServiceTokenPort { abstract getToken(): Promise<string> }`; `ContainerIdentityService implements TenantIdentityPort, ServiceTokenPort`; `ContainerModule` (importa `HttpModule`, `ConfigModule`; provee `{ provide: TenantIdentityPort, useExisting: ContainerIdentityService }` y `{ provide: ServiceTokenPort, useExisting: ContainerIdentityService }`; exporta ambos puertos).

- [ ] **Step 1:** Puertos en `core/domain/ports/` (un archivo cada uno, estilo de los existentes).
- [ ] **Step 2: `ContainerIdentityService`.** Constructor `(HttpService, ConfigService)`. `getTenantCode()`: devuelve el valor cacheado; si no hay, un único `GET /tenant` en vuelo (promesa compartida), valida que `code` sea string no vacío, lo cachea; ante fallo limpia la promesa en vuelo y lanza `ServiceUnavailableException`. `getToken()`: si hay token con `expiresAt - now > RENEW_MARGIN_MS` lo devuelve; si no, `refresh()` (promesa compartida) con 3 intentos y espera creciente; en éxito guarda `{ accessToken, expiresAt: now + expiresIn*1000 }` y descarta (error) una respuesta cuyo `accessToken` no sea string o `expiresIn` no sea número > 0; si `refresh()` falla y el token cacheado aún no expiró lo devuelve, si no lanza `ServiceUnavailableException('No se pudo obtener el token de servicio.')`. Registrar fallos con `Logger.warn` **sin** secreto ni token.
- [ ] **Step 3: `ContainerModule`** como en Interfaces.
- [ ] **Step 4:** Verificar. Run: `pnpm build` — Expected: sin errores nuevos en estos archivos.

### Task 2: Rag y webhook sin tenant ni API key

**Files:** Modify `knowledge.port.ts`, `rag-knowledge.service.ts`, `rag.module.ts`, `whats-app-message.service.ts`, `core/domain/tenant.ts`; Delete `tenant-id.decorator.ts`

**Interfaces:**
- Consumes: `ServiceTokenPort.getToken()` (Task 1).
- Produces: `KnowledgePort` sin tenant (firmas de Global Constraints).

- [ ] **Step 1:** `KnowledgePort` y `RagKnowledgeService` a las firmas sin tenant. El `request` obtiene `await this.serviceToken.getToken()` y envía `Authorization: Bearer <token>`; se eliminan `X-API-Key` y `X-Tenant-Id` y el uso de `RAG_API_KEY`. Si `getToken()` lanza, el error se propaga como `ServiceUnavailableException` (ya lo es).
- [ ] **Step 2:** `rag.module.ts` importa `ContainerModule`. `whats-app-message.service.ts`: `this.knowledge.search(text)` y se quita el import de `TENANT_ID`. `core/domain/tenant.ts` queda solo con `KNOWLEDGE_COLLECTION`. Borrar `tenant-id.decorator.ts`.
- [ ] **Step 3:** Verificar. Run: `pnpm build` — Expected: errores solo en `admin-knowledge.controller.ts` (Task 3) y specs.

### Task 3: Principal y guard de tenant en `/admin/*`

**Files:** Create `controller/guards/tenant-match.guard.ts`; Modify `jwt-auth.ts`, `admin-knowledge.controller.ts`, `admin-instructions.controller.ts`, `admin.module.ts`

**Interfaces:**
- Consumes: `TenantIdentityPort.getTenantCode()`.
- Produces: `JwtAuth.validate(claims: JwtClaims): { sub: string; tenantCode: string } | null` (rechaza si falta `sub` o `tenantCode` no cumple `^[a-z0-9][a-z0-9_-]{0,62}$`); `TenantMatchGuard implements CanActivate`.

- [ ] **Step 1:** `JwtAuth.validate` según Interfaces; nada más del archivo cambia.
- [ ] **Step 2:** `TenantMatchGuard`: lee `request.user.tenantCode`, lo compara con `await tenantIdentity.getTenantCode()`; distinto → `ForbiddenException('El token pertenece a otro tenant.')`; si container no responde, la `ServiceUnavailableException` del adaptador se propaga (503).
- [ ] **Step 3:** `@UseGuards(TenantMatchGuard)` a nivel de clase en los dos controllers `admin/*`; en `AdminKnowledgeController` quitar `@TenantId()` de cada handler (y `@ApiHeader`), llamando a `KnowledgePort` sin tenant. `admin.module.ts` importa `ContainerModule`.
- [ ] **Step 4:** Verificar. Run: `pnpm build` y `pnpm lint` — Expected: sin errores nuevos; `grep -rn "TenantId\|TENANT_ID\|X-Tenant-Id\|RAG_API_KEY" src` solo en specs.

### Task 4: Configuración y documentación

**Files:** Modify `.env.example`, `docker-compose.yml`, `CLAUDE_CONTEXT.md`, `docs/flow.md`, `../CLAUDE.md`

- [ ] **Step 1:** `.env.example` y `docker-compose.yml`: añadir `CONTAINER_API_URL`, `CONTAINER_CLIENT_ID`, `CONTAINER_CLIENT_SECRET`, quitar `RAG_API_KEY` (cambios mínimos en el compose, que tiene ediciones del usuario). Documentar en `CLAUDE_CONTEXT.md` y `docs/flow.md` el adaptador de identidad, la caché/renovación del token, el guard de tenant y el contrato asumido de container; en `../CLAUDE.md` el contrato bot ↔ container ↔ Rag-API.

### Task 5: Tests y verificación final

**Files:**
- Create: `infrastructure/extern/container/container-identity.service.spec.ts`, `controller/guards/tenant-match.guard.spec.ts`
- Modify: `rag-knowledge.service.spec.ts`, `admin-knowledge.controller.spec.ts`, `whats-app-message.service.spec.ts`, `infrastructure/extern/auth/jwt-auth/jwt-auth.spec.ts`
- Delete: `controller/decorators/tenant-id.decorator.spec.ts`

- [ ] **Step 1: `container-identity.service.spec.ts`** (mocks de `HttpService` y `ConfigService`, `vi.useFakeTimers()`): `getTenantCode` pide una vez y cachea; dos llamadas simultáneas = 1 petición; fallo → `ServiceUnavailableException` y la siguiente llamada reintenta; `getToken` cachea mientras falten más de 5 min; renueva dentro del margen; 5 llamadas simultáneas con token vencido = 1 petición a `/auth/service-token` (cuerpo `{ clientId, clientSecret }` de la config); falla el refresco con token aún vigente → devuelve el vigente; falla sin token → `ServiceUnavailableException`; 3 intentos con esperas 500 ms y 1000 ms; `expiresIn` ausente, `'x'`, `0` o negativo → no se cachea y falla; ningún `Logger.warn` ni mensaje de error contiene el secreto ni el token.
- [ ] **Step 2: `tenant-match.guard.spec.ts`:** mismo `tenantCode` → `true`; distinto → `ForbiddenException`; sin `request.user` → `ForbiddenException`; el adaptador lanza → se propaga.
- [ ] **Step 3: `jwt-auth.spec.ts`** (el existente solo comprueba que se instancia): añadir casos de `validate` — válido devuelve `{ sub, tenantCode }`; `null` sin `tenantCode`, con `'Acme'`, `'con espacio'`, `'a'.repeat(64)` y sin `sub`.
- [ ] **Step 4:** `rag-knowledge.service.spec.ts`: cada método envía `Authorization: Bearer <token del ServiceTokenPort>` y **no** envía `X-API-Key` ni `X-Tenant-Id`; la URL sigue `/collections/qwen/...`; `getToken` que lanza → el método rechaza con `ServiceUnavailableException`. `admin-knowledge.controller.spec.ts`: delegación sin tenant. `whats-app-message.service.spec.ts`: `knowledge.search` recibe solo el texto; si lanza, responde sin conocimiento. Borrar el spec del decorador.
- [ ] **Step 5: Ejecutar solo lo permitido.** Run: `pnpm lint && pnpm build && pnpm test` — Expected: todo en verde. NO ejecutar `pnpm test:e2e` (requiere Docker).
- [ ] **Step 6: Commit** (solo si el usuario lo pide): `git add -A && git commit -m "feat: service identity and tenantCode via container"`.
