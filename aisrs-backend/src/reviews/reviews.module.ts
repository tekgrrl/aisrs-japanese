import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { GeminiModule } from 'src/gemini/gemini.module';
import { forwardRef } from '@nestjs/common';
import { QuestionsModule } from 'src/questions/questions.module';
import { KnowledgeUnitsModule } from 'src/knowledge-units/knowledge-units.module';

@Module({
  imports: [
    GeminiModule, 
    forwardRef(() => QuestionsModule),
    KnowledgeUnitsModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService]
})
export class ReviewsModule {}
