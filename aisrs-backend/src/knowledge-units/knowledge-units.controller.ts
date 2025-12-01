import { Controller, Get, Put, Param, Body, Query, Post, BadRequestException } from '@nestjs/common';
import { KnowledgeUnitsService } from './knowledge-units.service';
import { ParseArrayPipe } from '@nestjs/common/pipes';


@Controller('knowledge-units')
export class KnowledgeUnitsController {
    constructor(
        private readonly knowledgeUnitsService: KnowledgeUnitsService,
    ) { }

    @Get('get-all')
    async findAll(
        @Query('status') status?: string,
        @Query('type') type?: string,
        @Query('content', new ParseArrayPipe({ items: String, separator: ',', optional: true })) content?: string[]
    ) {
        return this.knowledgeUnitsService.findAll({ status, type, content });
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        return this.knowledgeUnitsService.update(id, body);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.knowledgeUnitsService.findOne(id);
    }

    @Post()
    async create(@Body() body: any) {
        if (!body.content || !body.type) {
            throw new BadRequestException('Content and Type are required');
        }
        return this.knowledgeUnitsService.create(body);
    }

}
