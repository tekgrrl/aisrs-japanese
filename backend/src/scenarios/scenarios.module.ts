import { Module } from '@nestjs/common';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { GeminiModule } from '../gemini/gemini.module';
import { KnowledgeUnitsModule } from '../knowledge-units/knowledge-units.module';

@Module({
  imports: [
    GeminiModule,
    KnowledgeUnitsModule,
  ],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule { }