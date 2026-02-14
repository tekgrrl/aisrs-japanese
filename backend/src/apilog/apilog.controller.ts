import { Controller, Get, Query } from '@nestjs/common';
import { ApilogService } from './apilog.service';

@Controller('apilogs')
export class ApilogController {
    constructor(private readonly apilogService: ApilogService) { }

    @Get()
    async getLogs(
        @Query('limit') limitArg: string,
        @Query('route') route?: string,
        @Query('status') status?: string,
    ) {
        const limit = parseInt(limitArg, 10) || 50;
        // Don't allow massive queries
        const safeLimit = Math.min(Math.max(limit, 1), 100);

        return this.apilogService.findAll(safeLimit, route, status);
    }
}
