import { Controller, Get, Logger, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { GrammarSectionsService } from './grammar-sections.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('grammar-sections')
@UseGuards(FirebaseAuthGuard)
export class GrammarSectionsController {
    private readonly logger = new Logger(GrammarSectionsController.name);

    constructor(private readonly grammarSectionsService: GrammarSectionsService) { }

    @Get()
    async findAll() {
        const results = await this.grammarSectionsService.findAll();
        this.logger.log(`GET /grammar-sections — returned ${results.length}`);
        return results;
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const section = await this.grammarSectionsService.findById(id);
        if (!section) {
            throw new NotFoundException(`Grammar section ${id} not found`);
        }
        return section;
    }
}
