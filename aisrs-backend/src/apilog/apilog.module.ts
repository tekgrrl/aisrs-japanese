import { Global, Module } from '@nestjs/common';
import { ApilogService } from './apilog.service';

@Global()
@Module({
  providers: [ApilogService],
  exports: [ApilogService]
})
export class ApilogModule {}
