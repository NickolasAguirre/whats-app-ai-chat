import { GoogleGenAI } from '@google/genai';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GeminiService {
    constructor(private ai_gemini:GoogleGenAI){}
    geminiModel = "gemini-2.5-flash-lite";

    async sendMessage(message:string){
        const answer = await this.ai_gemini.interactions.create({model: this.geminiModel,input: message})
    }
}
