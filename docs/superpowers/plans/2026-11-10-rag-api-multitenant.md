# Rag-API multi-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rag-API atiende a varios tenants desde un solo despliegue: cada colección pertenece a un tenant (header `X-Tenant-Id`) y cada tenant tiene una colección por defecto `qwen` que se crea sola.

**Architecture:** `Collection` gana `tenantId` y la unicidad pasa a `(tenantId, name)`. Items y documentos se aíslan porque siempre se resuelven a través de su colección. Un `CollectionResolver` único (core/service) busca la colección del tenant y, si es la `qwen` y no existe, la crea. Los controllers leen el tenant con un decorador de parámetro y lo pasan como primer argumento a los services.

**Tech Stack:** NestJS 12 (ESM, imports con `.js`) · TypeORM 1 (EntitySchema) + PostgreSQL/pgvector · Vitest 4 · pnpm.

**Spec:** `docs/superpowers/specs/2026-11-10-rag-multitenant-e-historial-design.md` (secciones 2, 4.1–4.2; dudas D1–D3, D6–D11). Repo de trabajo: `what-app/Rag-API`.

## Global Constraints

- Header del tenant: `X-Tenant-Id`. Formato válido: `^[a-z0-9][a-z0-9_-]{0,62}$` (mismo patrón que el nombre de colección). Ausente o inválido → 400.
- Colección por defecto: nombre `qwen`, `embeddingModel`/`dimension` tomados de `EmbeddingPort` (`model`, `dimension`), igual que `CollectionService.create`.
- La `X-API-Key` (`ApiKeyGuard`) se mantiene tal cual; no hay validación del tenant contra container.API (D3, sin seguridad por ahora).
- Rompe el contrato actual sin compatibilidad hacia atrás (D11): todo endpoint exige `X-Tenant-Id`.
- Datos existentes: la migración los conserva bajo el tenant `default` (decisión mía para D9; no destruye datos).
- Regla del usuario (CLAUDE.md global): **primero todo el desarrollo, tests al final**. Durante las tareas 1–4 solo se compila (`pnpm build`); los tests se escriben y corren en la tarea 5.
- No hacer commit hasta que el usuario lo pida; sin `Co-Authored-By` en los mensajes.
- Imports relativos con extensión `.js`; 4 espacios en `src/`.

## Review Focus

- Dos tenants con una colección del mismo nombre no se ven entre sí (lista, búsqueda, documentos, ítems): aislamiento total.
- Pedir `POST /collections/qwen/search` de un tenant nuevo crea `qwen` (una sola vez) y devuelve resultados vacíos, no 404.
- Dos peticiones simultáneas de un tenant nuevo a `qwen` no producen 409 ni dos colecciones (carrera de creación).
- Un ítem/documento de otro tenant pedido por id con el nombre de colección propio responde 404, no el dato ajeno.
- Header con mayúsculas, espacios o más de 63 caracteres responde 400 (no llega a la BD).
- Una colección distinta de `qwen` que no existe sigue siendo 404 y no se autocrea.

## File Structure

- Create `src/infrastructure/persistence/migrations/1731000000000-add-tenant-to-collection.ts` — columna `tenantId` + unicidad compuesta.
- Create `src/controller/decorators/tenant-id.decorator.ts` — `@TenantId()` lee y valida el header.
- Create `src/core/service/collection/collection-resolver.service.ts` — resuelve colección por tenant y autocrea `qwen`.
- Modify: `collection.entity.ts`, `collection.port.ts`, `collection.schema.ts`, `collection.repository.ts`, `database.options.ts`, `collection.service.ts`, `item.service.ts`, `document.service.ts`, los 4 controllers, `rag-api.module.ts`, `errors.ts` (mensaje), `test/helpers/*`, specs y e2e, `CLAUDE_CONTEXT.md`.

---

### Task 1: Esquema y persistencia con `tenantId`

**Files:**
- Create: `src/infrastructure/persistence/migrations/1731000000000-add-tenant-to-collection.ts`
- Modify: `src/core/domain/entities/collection.entity.ts`, `src/core/domain/ports/collection-port/collection.port.ts`, `src/infrastructure/persistence/schemas/collection.schema.ts`, `src/infrastructure/persistence/repositories/collection.repository.ts`, `src/infrastructure/persistence/database.options.ts` (registrar la migración en `migrations`)

**Interfaces:**
- Produces: `Collection.tenantId: string`; `NewCollection` gana `tenantId: string`; en `CollectionRepositoryPort`: `create(data: NewCollection): Promise<Collection>`, `list(tenantId: string): Promise<Collection[]>`, `findByName(tenantId: string, name: string): Promise<Collection | null>`.

- [ ] **Step 1: Migración `AddTenantToCollection1731000000000`.** `up`: `ALTER TABLE "Collection" ADD COLUMN "tenantId" text NOT NULL DEFAULT 'default'`; quitar el default (`ALTER COLUMN ... DROP DEFAULT`); `DROP CONSTRAINT "UQ_Collection_name"`; `ADD CONSTRAINT "UQ_Collection_tenantId_name" UNIQUE ("tenantId", "name")`. `down` revierte en orden inverso (el `down` falla con 23505 si ya hay nombres repetidos entre tenants; es aceptable y se documenta en un comentario).
- [ ] **Step 2: Entidad y schema.** Añadir `tenantId: string` a `Collection`; en `CollectionSchema` columna `tenantId: { type: 'text' }` y reemplazar `unique: true` de `name` por `uniques: [{ name: 'UQ_Collection_tenantId_name', columns: ['tenantId', 'name'] }]`.
- [ ] **Step 3: Repositorio.** `create` guarda `tenantId`; `list(tenantId)` filtra por tenant (orden `createdAt ASC` como hoy); `findByName(tenantId, name)` usa `findOneBy({ tenantId, name })`; `toCollection` incluye `tenantId`.
- [ ] **Step 4: Registrar la migración** en `buildDatabaseOptions` (`migrations`) siguiendo el patrón existente.
- [ ] **Step 5: Verificar compilación.** Run: `pnpm build` — Expected: errores solo en services/controllers/tests que aún usan la firma vieja (se resuelven en tareas 2–4); ninguno en los archivos de esta tarea.

### Task 2: Decorador `@TenantId()` y `CollectionResolver`

**Files:**
- Create: `src/controller/decorators/tenant-id.decorator.ts`, `src/core/service/collection/collection-resolver.service.ts`
- Modify: `src/core/domain/errors.ts` (sin cambios de firma; solo si hace falta un mensaje), `src/core/service/collection/collection.service.ts`

**Interfaces:**
- Produces: `TenantId: () => ParameterDecorator` (lee `x-tenant-id`, lanza `BadRequestException('Falta o es inválido el header X-Tenant-Id')`); `export const DEFAULT_COLLECTION_NAME = 'qwen'` y `export const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/` en `src/core/domain/tenant.ts` (archivo nuevo, también creado en esta tarea); `class CollectionResolver { resolve(tenantId: string, name: string): Promise<Collection> }` (inyectable, usa `CollectionRepositoryPort` y `EmbeddingPort`).
- `CollectionService`: `create(tenantId: string, name: string): Promise<Collection>` y `list(tenantId: string): Promise<Collection[]>`.

- [ ] **Step 1: Crear `src/core/domain/tenant.ts`** con `DEFAULT_COLLECTION_NAME` y `TENANT_ID_PATTERN`.
- [ ] **Step 2: Decorador** con `createParamDecorator`: toma `request.headers['x-tenant-id']`; si no es `string` o no cumple `TENANT_ID_PATTERN`, `BadRequestException`.
- [ ] **Step 3: `CollectionResolver.resolve`.** Busca con `findByName(tenantId, name)`. Si existe, la devuelve. Si no existe y `name !== DEFAULT_COLLECTION_NAME`, lanza `CollectionNotFoundError(name)`. Si es la por defecto: `create({ tenantId, name, embeddingModel: embedding.model, dimension: embedding.dimension })`; si el repositorio lanza `CollectionAlreadyExistsError` (carrera), vuelve a hacer `findByName` y devuelve esa.
- [ ] **Step 4: Adaptar `CollectionService`** a las nuevas firmas pasando `tenantId` al puerto. `list(tenantId)` primero llama a `resolver.resolve(tenantId, DEFAULT_COLLECTION_NAME)` para que `GET /collections` de un tenant nuevo ya muestre `qwen` (inyectar `CollectionResolver`).
- [ ] **Step 5: Verificar compilación.** Run: `pnpm build` — Expected: sin errores en los archivos de esta tarea.

### Task 3: Services de ítems y documentos por tenant

**Files:**
- Modify: `src/core/service/item/item.service.ts`, `src/core/service/document/document.service.ts`

**Interfaces:**
- Consumes: `CollectionResolver.resolve(tenantId, name)` (Task 2).
- Produces: todas las operaciones públicas pasan a recibir `tenantId: string` como **primer** parámetro: `ItemService.add(tenantId, collectionName, newItems)`, `.get(tenantId, collectionName, itemId)`, `.search(tenantId, collectionName, request)`; `DocumentService.uploadFile(tenantId, collectionName, file)`, `.createNote(tenantId, collectionName, input)`, `.updateNote(tenantId, collectionName, id, input)`, `.list(tenantId, collectionName)`, `.get(tenantId, collectionName, id)`, `.remove(tenantId, collectionName, id)`.

- [ ] **Step 1: `ItemService`.** Reemplazar la dependencia `CollectionRepositoryPort` y el método privado `findCollection` por `CollectionResolver`; cada operación resuelve con `resolver.resolve(tenantId, collectionName)`. El resto de la lógica no cambia.
- [ ] **Step 2: `DocumentService`.** Igual: sustituir `findCollection` por el resolver, propagar `tenantId` también en las llamadas internas (`updateNote` → `get`, `remove` → `get`).
- [ ] **Step 3: Verificar compilación.** Run: `pnpm build` — Expected: errores solo en controllers y tests.

### Task 4: Controllers y módulo

**Files:**
- Modify: `src/controller/collections.controller.ts`, `items.controller.ts`, `search.controller.ts`, `documents.controller.ts`, `rag-api.module.ts`

**Interfaces:**
- Consumes: `@TenantId()` (Task 2), nuevas firmas de services (Tasks 2–3).

- [ ] **Step 1: Cada método de controller** recibe `@TenantId() tenantId: string` y lo pasa como primer argumento al service. En Swagger, añadir `@ApiHeader({ name: 'X-Tenant-Id', required: true })` a nivel de clase en los cuatro controllers.
- [ ] **Step 2: `CollectionsController.listCollections`** pasa el tenant a `collectionService.list(tenantId)`; `createCollection` a `create(tenantId, dto.name)`.
- [ ] **Step 3: `rag-api.module.ts`:** agregar `CollectionResolver` a `providers`.
- [ ] **Step 4: Verificar compilación.** Run: `pnpm build` — Expected: errores solo en archivos `*.spec.ts`/`test/` (no incluidos en el build de `dist` si `tsconfig.build.json` los excluye; si aparecen, es esperado hasta la tarea 5).

### Task 5: Tests, documentación y verificación final

**Files:**
- Modify: `test/helpers/fixtures.ts` (`createCollection` acepta `tenantId?: string`, por defecto `'test-tenant'`), `test/helpers/db.ts` (sin cambios), `src/core/service/collection/collection.service.spec.ts`, `item.service.spec.ts`, `document.service.spec.ts`, los 4 `*.controller.spec.ts`, `src/infrastructure/persistence/repositories/collection.repository.int-spec.ts`, `test/rag-api.e2e-spec.ts`, `CLAUDE_CONTEXT.md`
- Create: `src/core/service/collection/collection-resolver.service.spec.ts`, `src/controller/decorators/tenant-id.decorator.spec.ts`

- [ ] **Step 1: `collection-resolver.service.spec.ts`.** Casos con mocks de puertos: (a) devuelve la existente sin crear; (b) `qwen` inexistente → crea con `embeddingModel`/`dimension` del `EmbeddingPort`; (c) nombre ≠ `qwen` inexistente → `CollectionNotFoundError` y `create` no se llama; (d) `create` lanza `CollectionAlreadyExistsError` → devuelve la que encuentra el segundo `findByName`.
- [ ] **Step 2: `tenant-id.decorator.spec.ts`.** Header válido `acme_1` pasa; ausente, `Acme`, `''`, y 64 caracteres lanzan `BadRequestException`.
- [ ] **Step 3: Actualizar specs existentes** de services y controllers a las nuevas firmas (primer argumento `tenantId`); `collection.service.spec.ts` añade: `list('t1')` resuelve `qwen` antes de listar.
- [ ] **Step 4: `collection.repository.int-spec.ts`.** Mismo `name` en dos tenants se permite; duplicado en el mismo tenant lanza `CollectionAlreadyExistsError`; `findByName('t1','x')` no devuelve la de `t2`; `list('t1')` solo trae las suyas.
- [ ] **Step 5: e2e `test/rag-api.e2e-spec.ts`.** Enviar `X-Tenant-Id: tenant-a` en el helper `authed` existente. Casos nuevos: (a) sin header → 400 y con `Tenant-A` → 400; (b) `GET /collections` de `tenant-nuevo` devuelve una colección `qwen` con `embeddingModel: 'fake-embedding'` y `dimension: 64`; (c) aislamiento: `tenant-a` y `tenant-b` suben una nota a `qwen` con texto distinto, y la búsqueda de cada uno solo devuelve su texto; `GET /collections/qwen/documents/<id de a>` con `tenant-b` → 404; (d) `POST /collections/inexistente/search` → 404 y no la crea; (e) 5 `POST /collections/qwen/search` en paralelo (`Promise.all`) de un tenant nuevo → todos 200 y `GET /collections` lista una sola `qwen`.
- [ ] **Step 6: Documentar.** `CLAUDE_CONTEXT.md` de Rag-API: reemplazar "Sin tenants en el código: una sola `X-API-Key`" por el modelo nuevo (header `X-Tenant-Id`, colección `qwen` por defecto, `Collection.tenantId`). Añadir la nota de contrato en `what-app/CLAUDE.md` ("Contratos entre proyectos": Rag-API ahora recibe `X-Tenant-Id`).
- [ ] **Step 7: Ejecutar todo.** Run: `pnpm lint && pnpm build && pnpm test` — Expected: sin errores. Con los contenedores de test arriba (`docker compose -f docker-compose.test.yml up -d`): `pnpm test:int && pnpm test:e2e` — Expected: todo en verde. Aplicar la migración en dev: `pnpm build && pnpm migration:run`.
- [ ] **Step 8: Commit** (solo si el usuario lo pide): `git add -A && git commit -m "feat: multi-tenant collections with default qwen collection"`.
