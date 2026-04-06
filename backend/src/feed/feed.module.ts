import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';
import { UserModule } from '../users/user.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { KnowledgeUnitsModule } from '../knowledge-units/knowledge-units.module';

@Module({
  imports: [UserModule, ReviewsModule, KnowledgeUnitsModule],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
