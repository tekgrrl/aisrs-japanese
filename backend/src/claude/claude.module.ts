import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeService } from './claude.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
