import { Module } from '@nestjs/common';
import { GrammarSectionsService } from './grammar-sections.service';
import { GrammarSectionsController } from './grammar-sections.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [GrammarSectionsService],
  controllers: [GrammarSectionsController],
  exports: [GrammarSectionsService],
})
export class GrammarSectionsModule { }
