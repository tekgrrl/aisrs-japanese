import { Body, Controller, Get, Logger, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ConceptsService } from './concepts.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('concepts')
@UseGuards(FirebaseAuthGuard)
export class ConceptsController {
  private readonly logger = new Logger(ConceptsController.name);

  constructor(private readonly conceptsService: ConceptsService) {}

  /**
   * POST /api/concepts/generate
   * Body: { topic: string }
   *
   * Generates a new ConceptKnowledgeUnit via Gemini and persists it to the
   * `concepts` Firestore collection.
   */
  @Post('generate')
  async generate(
    @UserId() uid: string,
    @Body('topic') topic: string,
    @Body('notes') notes?: string,
  ) {
    this.logger.log(`POST /concepts/generate — uid=${uid} topic="${topic}" notes=${notes ? `"${notes.slice(0, 80)}…"` : 'none'}`);
    const result = await this.conceptsService.generate(uid, topic, notes);
    this.logger.log(`POST /concepts/generate — done, id=${result.id}`);
    return result;
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
