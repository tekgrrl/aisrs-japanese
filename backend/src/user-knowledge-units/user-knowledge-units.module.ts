import { Global, Module } from '@nestjs/common';
import { UserKnowledgeUnitsService } from './user-knowledge-units.service';

@Global()
@Module({
  providers: [UserKnowledgeUnitsService],
  exports: [UserKnowledgeUnitsService],
})
export class UserKnowledgeUnitsModule {}
