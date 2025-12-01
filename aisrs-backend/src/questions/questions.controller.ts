import { Controller, Get, Query, BadRequestException, Patch, Param, Body } from '@nestjs/common';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) { }

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

  @Patch(':id')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'flagged' | 'inactive' }
  ) {
    if (!body.status || !['active', 'flagged', 'inactive'].includes(body.status)) {
      throw new BadRequestException('Valid status is required');
    }

    return this.questionsService.updateStatus(id, body.status);
  }
}