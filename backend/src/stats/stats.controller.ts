import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('stats')
@UseGuards(FirebaseAuthGuard)
export class StatsController {
    constructor(private readonly statsService: StatsService) { }

    @Get()
    async getStats(@UserId() uid: string) {
        return this.statsService.getDashboardStats(uid);
    }
}
