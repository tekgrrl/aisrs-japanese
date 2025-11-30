import { Controller, Post, Body, BadRequestException, Put, Param } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) { }

  @Post('evaluate')
  async evaluate(@Body() body: { userAnswer: string; expectedAnswers: string[]; question: string; topic: string; questionId: string }) {
    const { userAnswer, expectedAnswers, question, topic, questionId } = body;

    if (
      userAnswer == null ||
      expectedAnswers == null ||
      !Array.isArray(expectedAnswers) ||
      expectedAnswers.length === 0
    ) {
      throw new BadRequestException('Missing userAnswer or expectedAnswer');
    }

    return this.reviewsService.evaluateAnswer(userAnswer, expectedAnswers, question, topic, questionId);
  }

  @Put('facets/:id')
  async updateSrs(
    @Param('id') id: string,
    @Body() body: { result: 'pass' | 'fail' }
  ) {
    if (!body.result || (body.result !== 'pass' && body.result !== 'fail')) {
      throw new BadRequestException('Result must be "pass" or "fail"');
    }

    return this.reviewsService.updateFacetSrs(id, body.result);
  }

  @Post('generate')
  async generateReviewFacets(
    @Body() body: { kuId: string, facetsToCreate: { key: string; data?: any }[] }
  ) {
    if (!body.kuId || !body.facetsToCreate || body.facetsToCreate.length === 0) {
      throw new BadRequestException('Missing kuId or facetsToCreate');
    }

    console.log(`Generating review facets for KU ${body.kuId}`);
    return this.reviewsService.generateReviewFacets(body.kuId, body.facetsToCreate);
  }
}
