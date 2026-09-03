
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { GoogleTtsService } from './google-tts.service';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
    imports: [ConfigModule, GeminiModule],
    controllers: [AudioController],
    providers: [
        AudioService,
        GoogleTtsService,
        {
            provide: 'ITtsProvider',
            useExisting: GoogleTtsService,
        },
    ],
})
export class AudioModule { }
