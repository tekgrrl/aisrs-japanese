import { Test, TestingModule } from '@nestjs/testing';
import { ApilogService } from './apilog.service';

describe('ApilogService', () => {
  let service: ApilogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApilogService],
    }).compile();

    service = module.get<ApilogService>(ApilogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
