import { Controller, Get, Query, BadRequestException, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('questions')
@UseGuards(FirebaseAuthGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) { }

  @Get('generate')
  async generate(
    @UserId() uid: string,
    @Query('topic') topic: string,
    @Query('facetId') facetId: string, // Optional depending on your logic
    @Query('kuId') kuId: string,       // Optional depending on your logic
  ) {
    if (!topic) {
      throw new BadRequestException('Topic is required');
    }
    return this.questionsService.generateQuestion(uid, topic, kuId, facetId);
  }

  @Patch(':id')
  async updateStatus(
    @UserId() uid: string,
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'flagged' | 'inactive' }
  ) {
    if (!body.status || !['active', 'flagged', 'inactive'].includes(body.status)) {
      throw new BadRequestException('Valid status is required');
    }

    return this.questionsService.updateStatus(uid, id, body.status);
  }
}