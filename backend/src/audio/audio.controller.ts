
import { Controller, Post, Body, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AudioService } from './audio.service';

@Controller('audio')
export class AudioController {
    private readonly logger = new Logger(AudioController.name);

    constructor(private readonly audioService: AudioService) { }

    @Post('speak')
    async speak(@Body('text') text: string, @Res() res: Response) {
        if (!text) {
            return res.status(400).send('Text is required');
        }

        try {
            const audioBuffer = await this.audioService.getAudioStream(text);

            res.set({
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.length,
            });

            res.send(audioBuffer);
        } catch (error) {
            this.logger.error('Error generating speech', error);
            res.status(500).send('Error generating speech');
        }
    }
}
