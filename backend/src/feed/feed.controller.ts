import { Controller, Post, UseGuards, Logger } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('feed')
@UseGuards(FirebaseAuthGuard)
export class FeedController {
  private readonly logger = new Logger(FeedController.name);

  constructor(private readonly feedService: FeedService) {}

  @Post('generate')
  async generateFeed(@UserId() uid: string) {
    this.logger.log(`Received request to generate daily feed for user ${uid}`);
    return this.feedService.generateDailyFeedQueue(uid);
  }
}
