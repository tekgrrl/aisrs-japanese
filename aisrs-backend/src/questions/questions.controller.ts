import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get('generate')
  async generate(
    @Query('topic') topic: string,
    @Query('facetId') facetId: string, // Optional depending on your logic
    @Query('kuId') kuId: string,       // Optional depending on your logic
  ) {
    if (!topic) {
      throw new BadRequestException('Topic is required');
    }
    return this.questionsService.generateQuestion(topic, kuId, facetId);
  }
}