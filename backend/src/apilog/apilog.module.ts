import { Global, Module } from '@nestjs/common';
import { ApilogService } from './apilog.service';
import { ApilogController } from './apilog.controller';

@Global()
@Module({
  controllers: [ApilogController],
  providers: [ApilogService],
  exports: [ApilogService]
})
export class ApilogModule { }
