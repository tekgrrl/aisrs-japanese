import { Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DailyPlanService } from './daily-plan.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('daily-plan')
@UseGuards(FirebaseAuthGuard)
export class DailyPlanController {
  constructor(private readonly dailyPlanService: DailyPlanService) {}

  @Post('check')
  async check(@UserId() uid: string) {
    return this.dailyPlanService.check(uid);
  }

  @Patch('opportunities/:kuId/dismiss')
  async dismissOpportunity(@UserId() uid: string, @Param('kuId') kuId: string) {
    await this.dailyPlanService.dismissOpportunity(uid, kuId);
    return { success: true };
  }
}
