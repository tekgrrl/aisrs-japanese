import { Controller, Post, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { LearnerFlagsService, LearnerFlagKuType, LearnerFlagChoice } from './learner-flags.service';

@Controller('learner-flags')
@UseGuards(FirebaseAuthGuard)
export class LearnerFlagsController {
  constructor(private readonly learnerFlagsService: LearnerFlagsService) {}

  @Post()
  async flag(
    @UserId() uid: string,
    @Body() body: { content: string; kuType: LearnerFlagKuType; choice: LearnerFlagChoice; context?: string },
  ) {
    if (!body.content || !body.kuType || !body.choice) {
      throw new BadRequestException('content, kuType, and choice are required');
    }
    if (body.kuType !== 'Vocab' && body.kuType !== 'Grammar') {
      throw new BadRequestException('kuType must be "Vocab" or "Grammar"');
    }
    if (body.choice !== 'exclude' && body.choice !== 'enroll') {
      throw new BadRequestException('choice must be "exclude" or "enroll"');
    }
    return this.learnerFlagsService.flag(uid, body.content, body.kuType, body.choice, body.context);
  }
}
