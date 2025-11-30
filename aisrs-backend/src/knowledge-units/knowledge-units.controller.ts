import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { KnowledgeUnitsService } from './knowledge-units.service';


@Controller('knowledge-units')
export class KnowledgeUnitsController {
    constructor(
        private readonly knowledgeUnitsService: KnowledgeUnitsService,
    ) { }

    @Get('get-all')
    async getAll() {
        return this.knowledgeUnitsService.getAll();
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        return this.knowledgeUnitsService.update(id, body);
    }
}
