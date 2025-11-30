import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { LessonsService } from './lessons.service';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post('generate')
  async generate(@Body() body: { kuId: string }) {
    if (!body.kuId) {
      throw new BadRequestException('kuId is required');
    }
    return this.lessonsService.generateLesson(body.kuId);
  }
}