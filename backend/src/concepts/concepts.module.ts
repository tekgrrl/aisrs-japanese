import { Module } from '@nestjs/common';
import { ConceptsService } from './concepts.service';
import { ConceptsController } from './concepts.controller';
import { GeminiModule } from '../gemini/gemini.module';
import { UserConceptsModule } from '../user-concepts/user-concepts.module';

@Module({
  imports: [GeminiModule, UserConceptsModule],
  providers: [ConceptsService],
  controllers: [ConceptsController],
  exports: [ConceptsService],
})
export class ConceptsModule {}
