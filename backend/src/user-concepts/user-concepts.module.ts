import { Module } from '@nestjs/common';
import { UserConceptsService } from './user-concepts.service';
import { UserConceptsController } from './user-concepts.controller';

@Module({
  providers: [UserConceptsService],
  controllers: [UserConceptsController],
  exports: [UserConceptsService],
})
export class UserConceptsModule {}
