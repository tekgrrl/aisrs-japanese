import { Module } from '@nestjs/common';
import { ConceptsService } from './concepts.service';
import { ConceptsController } from './concepts.controller';
import { UserConceptsController } from './user-concepts.controller';
import { GeminiModule } from '../gemini/gemini.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [GeminiModule, ReviewsModule],
  providers: [ConceptsService],
  controllers: [ConceptsController, UserConceptsController],
  exports: [ConceptsService],
})
export class ConceptsModule {}
