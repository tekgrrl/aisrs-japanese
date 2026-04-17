import { Controller, Get, Put, Patch, Param, Body, Query, Post, BadRequestException, NotFoundException, UseGuards, HttpCode } from '@nestjs/common';
import { KnowledgeUnitsService } from './knowledge-units.service';
import { UserKnowledgeUnitsService } from '../user-knowledge-units/user-knowledge-units.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { ParseArrayPipe } from '@nestjs/common/pipes';


@Controller('knowledge-units')
@UseGuards(FirebaseAuthGuard)
export class KnowledgeUnitsController {
    constructor(
        private readonly knowledgeUnitsService: KnowledgeUnitsService,
        private readonly userKnowledgeUnitsService: UserKnowledgeUnitsService,
    ) { }

    @Get('get-all')
    async findAll(
        @UserId() uid: string,
        @Query('status') status?: string,
        @Query('type') type?: string,
        @Query('content', new ParseArrayPipe({ items: String, separator: ',', optional: true })) content?: string[]
    ) {
        if (status === 'learning') {
            return this.userKnowledgeUnitsService.findLearningQueueAsKUs(uid);
        }
        return this.knowledgeUnitsService.findAll({ status, type, content });
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        return this.knowledgeUnitsService.update(id, body);
    }

    @Get(':id')
    async findOne(@UserId() uid: string, @Param('id') id: string) {
        const ku = await this.knowledgeUnitsService.findOneById(id);
        if (!ku) throw new NotFoundException(`Knowledge Unit ${id} not found`);

        // Direct owner (user_default managing corpus) or user has a UKU for this KU
        if (ku.userId === uid) return ku;

        const uku = await this.userKnowledgeUnitsService.findByKuId(uid, id);
        if (uku) return ku;

        throw new NotFoundException(`Knowledge Unit ${id} not found`);
    }

    @Patch('bulk')
    @HttpCode(200)
    async bulkUpdate(@Body() body: any) {
        if (!Array.isArray(body)) {
            throw new BadRequestException('Request body must be an array of Knowledge Units');
        }
        return this.knowledgeUnitsService.bulkUpdate(body);
    }

    @Post('bulk')
    @HttpCode(200)
    async bulkIngest(@Body() body: any) {
        if (!Array.isArray(body)) {
            throw new BadRequestException('Request body must be an array of Knowledge Units');
        }
        return this.knowledgeUnitsService.bulkIngest(body);
    }

    @Post()
    async create(@Body() body: any) {
        if (!body.content || !body.type) {
            throw new BadRequestException('Content and Type are required');
        }
        return this.knowledgeUnitsService.create(body);
    }

}
