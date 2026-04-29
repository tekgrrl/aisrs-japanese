import { Body, Controller, Get, HttpCode, Logger, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ConceptsService } from './concepts.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('concepts')
@UseGuards(FirebaseAuthGuard)
export class ConceptsController {
  private readonly logger = new Logger(ConceptsController.name);

  constructor(private readonly conceptsService: ConceptsService) {}

  @Post('generate')
  @HttpCode(202)
  generate(
    @UserId() uid: string,
    @Body('topic') topic: string,
    @Body('notes') notes?: string,
  ) {
    this.logger.log(`POST /concepts/generate — uid=${uid} topic="${topic}" (async)`);
    this.conceptsService.generate(uid, topic, notes)
      .then(result => this.conceptsService.enroll(uid, result.id)
        .then(() => this.logger.log(`POST /concepts/generate — done, id=${result.id}`))
      )
      .catch(err => this.logger.error(`POST /concepts/generate — failed for uid=${uid} topic="${topic}"`, err));
    return { status: 'generating' };
  }

  /**
   * GET /api/concepts
   *
   * Returns all concept documents ordered by creation date descending.
   */
  @Get()
  async findAll() {
    this.logger.log('GET /concepts');
    const results = await this.conceptsService.findAll();
    this.logger.log(`GET /concepts — returned ${results.length} documents`);
    return results;
  }

  /**
   * GET /api/concepts/:id
   *
   * Returns a single concept by its Firestore document ID.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.log(`GET /concepts/${id}`);
    const concept = await this.conceptsService.findById(id);
    if (!concept) {
      this.logger.warn(`GET /concepts/${id} — not found`);
      throw new NotFoundException(`Concept ${id} not found`);
    }
    this.logger.log(`GET /concepts/${id} — found, type=${concept.type}, title="${concept.data?.title}"`);
    return concept;
  }
}
