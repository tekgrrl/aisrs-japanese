import { Body, Controller, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { UserConceptsService } from './user-concepts.service';

@Controller('user-concepts')
@UseGuards(FirebaseAuthGuard)
export class UserConceptsController {
  private readonly logger = new Logger(UserConceptsController.name);

  constructor(private readonly userConceptsService: UserConceptsService) {}

  @Post()
  async enroll(@UserId() uid: string, @Body('conceptId') conceptId: string) {
    this.logger.log(`POST /user-concepts — uid=${uid} conceptId=${conceptId}`);
    return this.userConceptsService.enroll(uid, conceptId);
  }

  @Get()
  async findAll(@UserId() uid: string) {
    this.logger.log(`GET /user-concepts — uid=${uid}`);
    const results = await this.userConceptsService.findAllWithData(uid);
    this.logger.log(`GET /user-concepts — returned ${results.length} entries`);
    return results;
  }

  @Get(':conceptId/facets')
  async getFacets(@UserId() uid: string, @Param('conceptId') conceptId: string) {
    this.logger.log(`GET /user-concepts/${conceptId}/facets — uid=${uid}`);
    return this.userConceptsService.getFacets(uid, conceptId);
  }

  @Post(':conceptId/facets')
  async createFacets(
    @UserId() uid: string,
    @Param('conceptId') conceptId: string,
    @Body('mechanicIndices') mechanicIndices: number[],
    @Body('includeAiQuestion') includeAiQuestion?: boolean,
  ) {
    this.logger.log(`POST /user-concepts/${conceptId}/facets — uid=${uid} indices=${mechanicIndices} aiQuestion=${includeAiQuestion}`);
    return this.userConceptsService.createFacets(uid, conceptId, mechanicIndices, includeAiQuestion);
  }
}
