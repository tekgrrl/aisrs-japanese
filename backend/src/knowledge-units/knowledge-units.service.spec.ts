import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeUnitsService } from './knowledge-units.service';

describe('KnowledgeUnitsService', () => {
  let service: KnowledgeUnitsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KnowledgeUnitsService],
    }).compile();

    service = module.get<KnowledgeUnitsService>(KnowledgeUnitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
