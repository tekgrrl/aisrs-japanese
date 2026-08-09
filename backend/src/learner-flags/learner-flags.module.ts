import { Module } from '@nestjs/common';
import { LearnerFlagsController } from './learner-flags.controller';
import { LearnerFlagsService } from './learner-flags.service';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [StatsModule],
  controllers: [LearnerFlagsController],
  providers: [LearnerFlagsService],
})
export class LearnerFlagsModule {}
