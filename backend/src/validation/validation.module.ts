import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ValidationService } from './validation.service';
import { ContentFlagsController } from './content-flags.controller';
import { ApilogModule } from '../apilog/apilog.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [ConfigModule, ApilogModule, AuthModule],
  controllers: [ContentFlagsController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
