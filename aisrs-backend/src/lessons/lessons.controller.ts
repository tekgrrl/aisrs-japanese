import { Controller, Post, Body, BadRequestException, Param, Put, Get, Query } from '@nestjs/common';
import { LessonsService } from './lessons.service';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) { }

  @Post('generate')
  async generate(@Body() body: { kuId: string }) {
    if (!body.kuId) {
      throw new BadRequestException('kuId is required');
    }
    return this.lessonsService.generateLesson(body.kuId);
  }

  @Put(':kuId')
  async update(
    @Param('kuId') kuId: string,
    @Body() body: { section: string; content: string }
  ) {
    if (!body.section || body.content === undefined) {
      throw new BadRequestException('Section and content are required');
    }

    return this.lessonsService.updateLesson(kuId, body.section, body.content);
  }

  @Get()
  async findOne(@Query('kuId') kuId: string) {
    if (!kuId) {
      throw new BadRequestException('kuId is required');
    }

    const lesson = await this.lessonsService.findByKuId(kuId);

    // Return 404 if specific lesson lookup fails (optional, depends on frontend expectation)
    if (!lesson) {
      // We can return null or throw NotFoundException depending on need
      return null;
    }

    return lesson;
  }
}