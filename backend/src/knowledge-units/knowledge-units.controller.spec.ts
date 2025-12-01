import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeUnitsController } from './knowledge-units.controller';

describe('KnowledgeUnitsController', () => {
  let controller: KnowledgeUnitsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeUnitsController],
    }).compile();

    controller = module.get<KnowledgeUnitsController>(KnowledgeUnitsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
