import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiService } from './gemini.service';

@Global() // Optional: Makes it available everywhere without importing
@Module({
  imports: [ConfigModule.forRoot()], // Loads .env files
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}