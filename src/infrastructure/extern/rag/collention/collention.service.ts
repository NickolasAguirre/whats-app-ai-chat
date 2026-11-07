import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CollentionService {
    collectionUri:string;
    constructor(private readonly http: HttpService, private readonly config: ConfigService) {
        this.collectionUri = (this.config.get<string>('RAG_API_URL') || 'http://localhost:3100') + '/collection';
    }

    createCollection(collectionName: string){
        return this.http.post(`${this.collectionUri}`, { collectionName });
    }

}
