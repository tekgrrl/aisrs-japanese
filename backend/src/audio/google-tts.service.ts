
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { ITtsProvider } from './audio.interface';

@Injectable()
export class GoogleTtsService implements ITtsProvider {
    private client: TextToSpeechClient;
    private readonly logger = new Logger(GoogleTtsService.name);

    constructor(private configService: ConfigService) {
        const projectId = this.configService.get<string>('GOOGLE_CLOUD_PROJECT');
        this.client = new TextToSpeechClient({ projectId });
    }

    async generateAudio(text: string): Promise<Buffer> {
        const request = {
            input: { text },
            // Select the language and SSML voice gender (optional)
            voice: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
            // select the type of audio encoding
            audioConfig: { audioEncoding: 'MP3' as const },
        };

        try {
            const [response] = await this.client.synthesizeSpeech(request);

            if (!response.audioContent) {
                throw new Error('No audio content received from Google TTS');
            }

            // reliable way to get the buffer from Uint8Array | string | null | undefined
            return Buffer.from(response.audioContent);
        } catch (error) {
            this.logger.error(`Failed to generate audio for text: "${text.substring(0, 20)}..."`, error);
            throw error;
        }
    }
}
