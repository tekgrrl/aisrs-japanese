
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { GoogleTtsService } from './google-tts.service';

@Module({
    imports: [ConfigModule],
    controllers: [AudioController],
    providers: [
        AudioService,
        {
            provide: 'ITtsProvider',
            useClass: GoogleTtsService,
        },
    ],
})
export class AudioModule { }
