import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  const config = new DocumentBuilder()
  .setTitle("Chat-WhatsApp-AI")
  .setVersion("1")
  .addTag("App")
  .build();

  const documentFactory = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, documentFactory)
  await app.listen(process.env.PORT ?? 3000);
  
  // Log the running port/URL
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
await bootstrap();
