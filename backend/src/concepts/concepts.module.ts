import { Module } from '@nestjs/common';
import { ConceptsService } from './concepts.service';
import { ConceptsController } from './concepts.controller';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [GeminiModule],
  providers: [ConceptsService],
  controllers: [ConceptsController],
  exports: [ConceptsService],
})
export class ConceptsModule {}
