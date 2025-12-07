import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KanjiService } from './kanji.service';
import { KanjiController } from './kanji.controller';
import { KnowledgeUnitsModule } from '../knowledge-units/knowledge-units.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [ConfigModule, KnowledgeUnitsModule, GeminiModule],
  controllers: [KanjiController],
  providers: [KanjiService],
})
export class KanjiModule { }