import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { KanjiService } from './kanji.service';

@Controller('kanji')
export class KanjiController {
    constructor(private readonly kanjiService: KanjiService) { }

    @Get('details')
    async getDetails(
        @Query('char') char: string,
        @Query('kuId') kuId?: string
    ) {
        if (!char) {
            throw new BadRequestException('Kanji character (char) is required');
        }
        return this.kanjiService.getKanjiDetails(char, kuId);
    }
}