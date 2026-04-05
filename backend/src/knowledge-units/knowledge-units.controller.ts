import { Controller, Get, Put, Param, Body, Query, Post, BadRequestException, UseGuards } from '@nestjs/common';
import { KnowledgeUnitsService } from './knowledge-units.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { ParseArrayPipe } from '@nestjs/common/pipes';


@Controller('knowledge-units')
@UseGuards(FirebaseAuthGuard)
export class KnowledgeUnitsController {
    constructor(
        private readonly knowledgeUnitsService: KnowledgeUnitsService,
    ) { }

    @Get('get-all')
    async findAll(
        @UserId() uid: string,
        @Query('status') status?: string,
        @Query('type') type?: string,
        @Query('content', new ParseArrayPipe({ items: String, separator: ',', optional: true })) content?: string[]
    ) {
        return this.knowledgeUnitsService.findAll(uid, { status, type, content });
    }

    @Put(':id')
    async update(@UserId() uid: string, @Param('id') id: string, @Body() body: any) {
        return this.knowledgeUnitsService.update(uid, id, body);
    }

    @Get(':id')
    async findOne(@UserId() uid: string, @Param('id') id: string) {
        return this.knowledgeUnitsService.findOne(uid, id);
    }

    @Post()
    async create(@UserId() uid: string, @Body() body: any) {
        if (!body.content || !body.type) {
            throw new BadRequestException('Content and Type are required');
        }
        return this.knowledgeUnitsService.create(uid, body);
    }

}
