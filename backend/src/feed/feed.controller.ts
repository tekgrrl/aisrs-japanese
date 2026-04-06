import { Controller, Post, Get, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('feed')
@UseGuards(FirebaseAuthGuard)
export class FeedController {
  private readonly logger = new Logger(FeedController.name);

  constructor(private readonly feedService: FeedService) {}

  /**
   * POST /feed/generate
   * Triggers daily feed generation for the authenticated user.
   */
  @Post('generate')
  async generateFeed(@UserId() uid: string) {
    this.logger.log(`Received request to generate daily feed for user ${uid}`);
    return this.feedService.generateDailyFeedQueue(uid);
  }

  /**
   * GET /feed
   * Returns the current pending feed queue for the authenticated user.
   */
  @Get()
  async getFeed(@UserId() uid: string) {
    this.logger.log(`Fetching daily feed for user ${uid}`);
    return this.feedService.getDailyFeed(uid);
  }

  /**
   * POST /feed/complete-item
   * Marks a feed item as completed. Expects { feedItemId: string } in the body.
   */
  @Post('complete-item')
  async completeItem(
    @UserId() uid: string,
    @Body() body: { feedItemId: string },
  ) {
    if (!body.feedItemId) {
      throw new BadRequestException('Missing feedItemId');
    }

    this.logger.log(`Marking feed item ${body.feedItemId} as completed for user ${uid}`);
    return this.feedService.completeItem(uid, body.feedItemId);
  }
}
