import { Module } from '@nestjs/common';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { GeminiModule } from '../gemini/gemini.module';
import { KnowledgeUnitsModule } from '../knowledge-units/knowledge-units.module';
import { LessonsModule } from '../lessons/lessons.module';
import { UserModule } from '../users/user.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    GeminiModule,
    KnowledgeUnitsModule,
    LessonsModule,
    UserModule,
    AuthModule,
  ],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule { }