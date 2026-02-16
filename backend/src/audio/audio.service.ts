
import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ITtsProvider } from './audio.interface';

@Injectable()
export class AudioService {
    private readonly logger = new Logger(AudioService.name);

    constructor(@Inject('ITtsProvider') private readonly ttsProvider: ITtsProvider) { }

    async getAudioStream(text: string): Promise<Buffer> {
        this.logger.log(`Generating audio for text: "${text.substring(0, 50)}..."`);
        try {
            return await this.ttsProvider.generateAudio(text);
        } catch (error) {
            this.logger.error('Failed to generate audio stream', error);
            throw error;
        }
    }
}
