import { Global, Module } from '@nestjs/common';
import { KnowledgeUnitsController } from './knowledge-units.controller';
import { KnowledgeUnitsService } from './knowledge-units.service';

@Global()
@Module({
  controllers: [KnowledgeUnitsController],
  providers: [KnowledgeUnitsService],
  exports: [KnowledgeUnitsService],
})
export class KnowledgeUnitsModule {}
