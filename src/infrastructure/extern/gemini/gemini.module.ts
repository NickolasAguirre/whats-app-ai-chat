import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service.js';
import { HttpModule } from '@nestjs/axios';

@Module({
    exports:[GeminiService],
    imports:[HttpModule]
})
export class GeminiModule {}
