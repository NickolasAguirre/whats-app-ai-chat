<!-- bmad:context -->
<!-- Verified 2026-11-15 against 89ecd0e (working tree has uncommitted changes). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## whatsapp-chat-bot-API

WhatsApp support bot: YCloud webhook → Gemini/Qwen → reply. NestJS/TypeScript, TypeORM + Postgres, Redis, pnpm, Node 24. One deployment = one tenant. Sibling repos in `what-app/`: `../Rag-API` (knowledge), `../whatsapp-chat-bot-WEB` (admin panel), `../../Container/container.API` (auth).

## Policy

- Ask before `git push`. PR descriptions state what changed and why.
- Never discard uncommitted changes (`git checkout -- <file>`, `git restore`, `git reset --hard`); ask first — it once deleted uncommitted config.
- Never start or stop Docker containers or dev servers unless asked; the user runs their own.

## Where things are

- Architecture and message flow: `docs/architecture.md`, `docs/flow.md`. Adding a module, provider or AI provider? Read `docs/conventions.md` first.
- Design specs: `docs/superpowers/specs/` (tenant and auth: `2026-11-13-auth-servicio-tenant-code-design.md`).
- Webhook: `src/controller/whatsapp-message.controller.ts`. Panel BFF: `src/controller/admin-*.controller.ts`.
- Cross-repo contracts (bot ↔ Rag-API ↔ panel): `../CLAUDE.md`.

## Running and verifying

- The bot listens on 3200, not 3000 (3000 is container.API, which `CONTAINER_API_URL` points at).
- `migration:run` reads `dist/`: run `pnpm build` first.

## Conventions that differ from defaults

- Ports are `abstract class`, not `interface` — they are Nest DI tokens. Bind with `useExisting`; export the port, never the concrete class.
- All `*.module.ts` live in `src/infrastructure/modules/`; controllers have no modules.
- DTOs shaped by an external provider (YCloud) go in `infrastructure/`, never `core/`.
- TypeORM `EntitySchema`, no decorators. No `tenantId` in code or tables: the tenant comes from container.API (`GET /tenant`) and `TenantMatchGuard` protects `/admin/*`.
- Postgres `Message` is the source of truth for history; Redis (`MessageMemoryPort`) is only the recent LLM context.

## Known pitfalls

- Put `ValidationPipe` only on `/admin/*` controllers; the YCloud DTO has no decorators and `whitelist` would empty it.
- Verify the webhook signature on the raw body (`rawBody: true` in `main.ts`), never on re-serialized JSON.

<!-- /bmad:context -->
