# Bot: conocimiento por tenant e historial en BD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bot busca y administra conocimiento por tenant (constante en el webhook, header `X-Tenant-Id` en `/admin/knowledge`) sin configurar colección, y guarda todos los mensajes en PostgreSQL además de Redis.

**Architecture:** `KnowledgePort` recibe `tenantId` en cada método; `RagKnowledgeService` lo envía como `X-Tenant-Id` y usa siempre la colección por defecto `qwen`. El historial vive en un puerto nuevo `MessageHistoryPort` (adapter TypeORM, tabla `Message`), separado de `MessageMemoryPort` (Redis). El servicio del webhook guarda el mensaje entrante antes de llamar al LLM, deduplica por id de YCloud y, si Redis está vacío, reconstruye el contexto desde la BD.

**Tech Stack:** NestJS 12 · TypeORM (EntitySchema, sin decoradores) + PostgreSQL · ioredis · Vitest · pnpm.

**Spec:** `docs/superpowers/specs/2026-11-10-rag-multitenant-e-historial-design.md` (secciones 2, 4.3–4.4; D4, D5, D12–D18, D21–D23). **Requiere** el plan `2026-11-10-rag-api-multitenant.md` ya aplicado en Rag-API.

## Global Constraints

- Tenant del webhook: constante `TENANT_ID = 'default'` en un único archivo (`src/core/domain/tenant.ts`). El valor `'default'` es decisión mía y debe coincidir con el `code` que siembra container.API (plan `2026-11-10-container-tenant-code.md`).
- `/admin/knowledge` exige el header `X-Tenant-Id` con formato `^[a-z0-9][a-z0-9_-]{0,62}$`; ausente o inválido → 400 (decisión mía, D23).
- Colección fija `qwen`: se elimina `RAG_COLLECTION` de código, `.env.example` y `docker-compose.yml`; se elimina el bootstrap que creaba la colección (Rag-API la autocrea).
- Roles de mensaje: se mantienen los existentes `'inbound' | 'outbound'` (ConversationMessageRole), no `user/assistant` (decisión mía).
- Tabla `Message`: `id` uuid, `personId` uuid FK → `Person`, `role` text, `content` text, `providerMessageId` text nullable único, `createdAt` timestamptz; índice `(personId, createdAt)`.
- Fallos de la BD de historial se registran con `logger.warn` y **no** impiden responder (D14), salvo la deduplicación que solo omite cuando hay certeza de duplicado.
- Redis conserva su TTL y límite actuales (`MAX_MESSAGES_PER_CONVERSATION = 20`); el contexto de rehidratación usa el mismo 20.
- Regla del usuario: **primero todo el desarrollo, tests al final** (Task 5). Antes solo `pnpm build`.
- No hacer commit hasta que el usuario lo pida; sin `Co-Authored-By` (regla del usuario).
- Imports con `.js`; `pnpm lint` (oxlint) debe pasar.

## Review Focus

- El mismo webhook de YCloud reenviado (mismo `whatsappInboundMessage.id`) no genera una segunda respuesta ni mensajes duplicados en la BD.
- `/admin/knowledge` sin header o con `ACME` responde 400 y no llama a Rag-API.
- Si falla el insert del historial (BD caída) el cliente igualmente recibe su respuesta.
- Redis vacío o caído para una persona con historial en BD: el LLM recibe los últimos 20 mensajes, sin incluir el mensaje actual duplicado.
- Rag-API caído: se responde sin conocimiento (comportamiento actual), ahora también con el tenant.
- Un mensaje sin `id` de proveedor (`providerMessageId` undefined) se guarda igualmente y no choca con la restricción de unicidad (varios `NULL` permitidos).

## File Structure

- Create `src/core/domain/tenant.ts`, `src/controller/decorators/tenant-id.decorator.ts`.
- Create `src/core/domain/ports/message-history-port/message-history.port.ts`, `src/infrastructure/persistence/schemas/message.schema.ts`, `src/infrastructure/persistence/repositories/message-history.repository.ts`, `src/infrastructure/persistence/message-history-repository.module.ts`, `src/infrastructure/persistence/migrations/1731000000000-create-message.ts`.
- Modify: `knowledge.port.ts`, `rag-knowledge.service.ts`, `rag.module.ts`, `admin-knowledge.controller.ts`, `whatsapp-message.controller.ts`, `whatsapp-message.module.ts`, `whats-app-message.service.ts`, `schemas/index.ts`, `database.options.ts`, `.env.example`, `docker-compose.yml`, `CLAUDE_CONTEXT.md`, `docs/flow.md`.
- Delete: `src/infrastructure/extern/rag/knowledge/rag-collection.bootstrap.ts`.

---

### Task 1: Tenant y conocimiento por tenant

**Files:**
- Create: `src/core/domain/tenant.ts`, `src/controller/decorators/tenant-id.decorator.ts`
- Modify: `src/core/domain/ports/knowledge-port/knowledge.port.ts`, `src/infrastructure/extern/rag/knowledge/rag-knowledge.service.ts`, `src/infrastructure/extern/rag/rag.module.ts`, `src/controller/admin-knowledge.controller.ts`
- Delete: `src/infrastructure/extern/rag/knowledge/rag-collection.bootstrap.ts`

**Interfaces:**
- Produces: `export const TENANT_ID = 'default'`, `export const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/`, `export const KNOWLEDGE_COLLECTION = 'qwen'` en `core/domain/tenant.ts`; `TenantId: () => ParameterDecorator` (header `x-tenant-id`, `BadRequestException` si falta o no cumple el patrón).
- `KnowledgePort` (cada método con `tenantId: string` primero): `list(tenantId)`, `uploadFile(tenantId, file)`, `createNote(tenantId, input)`, `updateNote(tenantId, id, input)`, `remove(tenantId, id)`, `search(tenantId, query): Promise<string[]>`.

- [ ] **Step 1: `tenant.ts` y decorador** (mismo comportamiento que el decorador de Rag-API).
- [ ] **Step 2: `KnowledgePort`** con las firmas de arriba; actualizar el comentario de `search`.
- [ ] **Step 3: `RagKnowledgeService`.** Recibir `tenantId` en cada método y pasarlo a `request`, que añade el header `X-Tenant-Id` junto al `X-API-Key`; `collectionUrl()` usa `KNOWLEDGE_COLLECTION` en lugar de `RAG_COLLECTION`.
- [ ] **Step 4: Eliminar `RagCollectionBootstrap`** y quitarlo de `providers` en `rag.module.ts`.
- [ ] **Step 5: `AdminKnowledgeController`.** Cada handler recibe `@TenantId() tenantId: string` y lo pasa a `KnowledgePort`; añadir `@ApiHeader({ name: 'X-Tenant-Id', required: true })` a la clase.
- [ ] **Step 6: Verificar compilación.** Run: `pnpm build` — Expected: errores solo en `whats-app-message.service.ts` y specs (se corrigen en Task 3/5).

### Task 2: Persistencia del historial

**Files:**
- Create: `src/core/domain/ports/message-history-port/message-history.port.ts`, `src/infrastructure/persistence/schemas/message.schema.ts`, `src/infrastructure/persistence/repositories/message-history.repository.ts`, `src/infrastructure/persistence/message-history-repository.module.ts`, `src/infrastructure/persistence/migrations/1731000000000-create-message.ts`
- Modify: `src/infrastructure/persistence/schemas/index.ts`, `src/infrastructure/persistence/database.options.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface NewHistoryMessage { personId: string; role: ConversationMessageRole; content: string; providerMessageId?: string; createdAt: Date }
  export abstract class MessageHistoryPort {
      /** Guarda el mensaje; devuelve su id, o null si ya existía ese providerMessageId. */
      abstract save(message: NewHistoryMessage): Promise<string | null>;
      /** Últimos `limit` mensajes de la persona en orden cronológico, sin el mensaje `excludeId`. */
      abstract findRecent(personId: string, limit: number, excludeId?: string): Promise<ConversationMessage[]>;
  }
  ```

- [ ] **Step 1: Migración `CreateMessage1731000000000`.** Crea `"Message"` con las columnas de las Global Constraints, FK `"FK_Message_personId"` a `"Person"("id") ON DELETE RESTRICT`, `UQ_Message_providerMessageId` UNIQUE, e índice `IDX_Message_personId_createdAt`; `down` hace `DROP TABLE "Message"`.
- [ ] **Step 2: `MessageSchema`** (`EntitySchema<StoredMessage>` con interfaz local `StoredMessage` en el mismo archivo, campos de la tabla) y exportarlo en `schemas/index.ts`; añadir `MessageSchema` y la migración a `buildDatabaseOptions`.
- [ ] **Step 3: `MessageHistoryRepository`.** `save`: `INSERT ... ON CONFLICT DO NOTHING` con `createQueryBuilder().insert().values(...).orIgnore().returning('id').execute()` (mismo estilo que `PersonRepository.findOrCreate`); devuelve `raw[0]?.id ?? null`. `findRecent`: ordena `createdAt DESC, id`, filtra `id <> excludeId` si se pasó, `take(limit)`, devuelve invertido y mapeado a `{ role, text: content, timestamp: createdAt }`.
- [ ] **Step 4: `MessageHistoryRepositoryModule`** (mismo patrón que `PersonRepositoryModule`; exporta `MessageHistoryPort`).
- [ ] **Step 5: Verificar compilación.** Run: `pnpm build` — Expected: sin errores nuevos en estos archivos.

### Task 3: Flujo del webhook con tenant e historial

**Files:**
- Modify: `src/controller/whatsapp-message.controller.ts`, `src/controller/whatsapp-message.module.ts`, `src/core/use-case/whats-app-message/whats-app-message.service.ts`

**Interfaces:**
- Consumes: `TENANT_ID` (Task 1), `MessageHistoryPort` (Task 2).
- Produces: `handleIncomingMessage(from: string, to: string, text: string, personName?: string, providerMessageId?: string): Promise<void>`.

- [ ] **Step 1: Controller.** Pasar `event.whatsappInboundMessage.id` como quinto argumento.
- [ ] **Step 2: Módulo.** Importar `MessageHistoryRepositoryModule`.
- [ ] **Step 3: Servicio — orden del flujo.** (1) `findOrCreate` persona; (2) guardar el entrante con `history.save({ personId, role: 'inbound', content: text, providerMessageId, createdAt: now })` dentro de un helper `saveInboundSafely` que devuelve `{ duplicate: boolean; id?: string }`: `duplicate: true` solo cuando `save` devuelve `null`; ante excepción registra `warn` y devuelve `{ duplicate: false }`; si `duplicate`, retornar sin llamar al LLM ni a WhatsApp (log `info`); (3) instrucciones; (4) historial desde Redis; si está vacío, `history.findRecent(person.id, 20, id)` (envuelto en try/catch → `[]`); (5) `knowledge.search(TENANT_ID, text)`; (6) LLM; (7) append en Redis (inbound y outbound, como hoy) y guardar el saliente con `history.save({ role: 'outbound', content: replyText, personId, createdAt })` en un helper `saveOutboundSafely` (warn si falla); (8) enviar por WhatsApp. `now` se calcula una vez; el saliente usa un `Date` posterior (`new Date()` al guardar) para que el orden sea estable.
- [ ] **Step 4: Verificar compilación.** Run: `pnpm build` — Expected: sin errores salvo specs antiguos.

### Task 4: Configuración y documentación

**Files:**
- Modify: `.env.example`, `docker-compose.yml`, `CLAUDE_CONTEXT.md`, `docs/flow.md`, `../CLAUDE.md` (what-app)

- [ ] **Step 1:** Eliminar `RAG_COLLECTION` de `.env.example` y `docker-compose.yml`; añadir comentario de que el conocimiento usa la colección `qwen` del tenant.
- [ ] **Step 2:** `CLAUDE_CONTEXT.md`: actualizar las líneas de Rag-API (`X-Tenant-Id`, sin bootstrap), añadir la tabla `Message` y el puerto `MessageHistoryPort`, y la constante `TENANT_ID`.
- [ ] **Step 3:** `docs/flow.md`: reflejar el nuevo orden (guardar entrante → deduplicar → historial Redis/BD → conocimiento por tenant → LLM → guardar saliente).
- [ ] **Step 4:** En `what-app/CLAUDE.md`, actualizar el contrato: el panel y el bot envían `X-Tenant-Id` a Rag-API; el panel lo manda al bot.

### Task 5: Tests y verificación final

**Files:**
- Modify: `src/infrastructure/extern/rag/knowledge/rag-knowledge.service.spec.ts`, `src/core/use-case/whats-app-message/whats-app-message.service.spec.ts`, `src/controller/whatsapp-message.controller.spec.ts`
- Create: `src/controller/admin-knowledge.controller.spec.ts`, `src/controller/decorators/tenant-id.decorator.spec.ts`, `src/infrastructure/persistence/repositories/message-history.repository.spec.ts`

- [ ] **Step 1: `rag-knowledge.service.spec.ts`.** Cada método envía `X-Tenant-Id: <tenant>` y `X-API-Key`; la URL usa `/collections/qwen/...`; ya no se lee `RAG_COLLECTION`.
- [ ] **Step 2: `tenant-id.decorator.spec.ts` y `admin-knowledge.controller.spec.ts`.** Header válido pasa al puerto (`knowledge.list('acme')`); `ACME`, vacío y ausente → `BadRequestException` (para el controller basta verificar la delegación con el tenant, el decorador se prueba aparte).
- [ ] **Step 3: `message-history.repository.spec.ts`** (mocks al estilo de `person.repository.spec.ts`): `save` devuelve el id insertado y `null` cuando `raw` viene vacío (conflicto); `save` sin `providerMessageId` inserta `undefined`; `findRecent` devuelve en orden cronológico, aplica `excludeId` y limita.
- [ ] **Step 4: `whats-app-message.service.spec.ts`** (añadir `MessageHistoryPort` mock y actualizar los existentes con `knowledge.search('default', 'hola')`): (a) guarda entrante antes de generar y saliente después (verificar orden de llamadas); (b) `save` entrante devuelve `null` → no llama a `generateMessage` ni `sendMessage`; (c) `save` entrante lanza → igual responde; (d) `save` saliente lanza → igual envía por WhatsApp; (e) Redis vacío → `findRecent('p1', 20, 'm1')` alimenta `history` del LLM; (f) Redis con mensajes → `findRecent` no se llama; (g) Redis lanza y BD responde → usa BD.
- [ ] **Step 5: `whatsapp-message.controller.spec.ts`.** Verifica que se pasa `whatsappInboundMessage.id` como quinto argumento.
- [ ] **Step 6: Ejecutar.** Run: `pnpm lint && pnpm build && pnpm test` — Expected: todo verde. Aplicar migración: `pnpm build && pnpm migration:run` — Expected: crea `Message`. Prueba manual con Rag-API y Postgres arriba: `curl -H "X-Tenant-Id: default" localhost:3000/admin/knowledge` → `200 []`; sin header → `400`.
- [ ] **Step 7: Commit** (solo si el usuario lo pide): `git add -A && git commit -m "feat: per-tenant knowledge and persisted message history"`.
