# Convenciones de este proyecto

## NestJS DI: `providers` vs `imports`

- `imports`: solo para otros `@Module()`. Nunca para clases sueltas — ni siquiera si esa clase necesita configuración compleja.
- `providers`: donde se registra cualquier clase/valor/factory que este módulo sabe construir, incluido el binding de un puerto a su adapter.

Un módulo importado (`imports: [OtroModulo]`) solo te da acceso a lo que ese módulo declaró en su propio `exports` — nunca a sus providers internos no exportados.

## Cómo bindear un puerto a su adapter (patrón `useExisting`)

```ts
@Module({
    providers: [
        ConcreteService,
        { provide: AbstractPort, useExisting: ConcreteService },
    ],
    exports: [AbstractPort],   // se exporta el puerto, nunca la clase concreta
})
export class SomeModule {}
```

`useExisting` reutiliza la instancia ya creada para el token `ConcreteService` bajo un segundo token (`AbstractPort`) — no crea una segunda instancia, a diferencia de `useClass` (que sí construiría un objeto nuevo, duplicando el singleton).

Exportar solo el puerto (no la clase concreta) es lo que impide que un módulo consumidor pueda inyectar la implementación concreta por accidente — solo puede pedir la abstracción.

## Cuándo un provider necesita `useFactory`

Si el constructor de una clase necesita algo que Nest no puede resolver por reflexión de tipos (una API key, un objeto de configuración plano, una clase de una librería externa no pensada para Nest DI), hace falta:

```ts
{
    provide: SomeExternalClass,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => new SomeExternalClass({ apiKey: config.get('...') }),
}
```

Si el constructor de una clase solo pide otras clases inyectables (otro `@Injectable()`, otro puerto), Nest la construye solo — no hace falta `useFactory`. Es el caso de la mayoría de los services de este proyecto (`GeminiService`, `QwenService`, `WhatsAppService`, `AiService`, el use-case).

## Cómo agregar un proveedor de IA nuevo (patrón Gemini/Qwen)

1. Crear `infrastructure/extern/ai/<proveedor>/<proveedor>.service.ts` — la clase implementa `AiSelectedPort`, con `generateMessage(message: string): Promise<string>`.
2. Crear `infrastructure/extern/ai/<proveedor>/<proveedor>.module.ts` — exportar una constante de token propia (`export const <PROVEEDOR>_AI_PORT = "..."`), bindearla con `useExisting` al service, y `exports: [<PROVEEDOR>_AI_PORT]`. El SDK del proveedor (si necesita API key) va como provider con `useFactory`.
3. En `ai.module.ts`: agregar el módulo nuevo al array `imports`.
4. En `ai.service.ts`: inyectar el token nuevo con `@Inject(<PROVEEDOR>_AI_PORT)`, tipado como `AiSelectedPort`, e incorporarlo a la lógica de `getProvider()`.

No hace falta tocar nada dentro de `core/` para agregar un proveedor — es exactamente el punto de la arquitectura por puertos.

## Convención de tests (specs)

Los specs de un service que **depende de** un puerto mockean el puerto, nunca la clase concreta real detrás:

```ts
{ provide: AiPort, useValue: { generateMessage: vi.fn() } }
```

Los specs de un adapter concreto (`GeminiService`, `QwenService`, `WhatsAppService`) mockean **sus propias dependencias externas** (el SDK del proveedor, `HttpService`, `ConfigService`) — nunca el puerto que ellos mismos implementan, porque ahí es la implementación real la que se está probando.

## Webhooks con verificación de firma

Cuando un guard necesita validar una firma HMAC sobre el body de una request (como `YCloudWebhookSignatureGuard`), es imprescindible habilitar `rawBody: true` en `NestFactory.create()` (`main.ts`). La firma se calcula sobre el string exacto que mandó el proveedor — si Nest ya parseó el body a JSON y se re-serializa para validar, el hash casi nunca va a coincidir (distinto orden de claves, espacios, etc.).
