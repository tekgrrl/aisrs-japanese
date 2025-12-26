import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { FIRESTORE_CONNECTION } from '../firebase/firebase.module';
import { GeminiService } from '../gemini/gemini.service';
import { QuestionsService } from '../questions/questions.service';
import { KnowledgeUnitsService } from '../knowledge-units/knowledge-units.service';
import { LessonsService } from '@/lessons/lessons.service';
import { StatsService } from '../stats/stats.service';

describe('ReviewsService', () => {
  let service: ReviewsService;

  const mockFirestore = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn(),
    runTransaction: jest.fn(),
  };

  const mockGeminiService = {};
  const mockQuestionsService = {};
  const mockKnowledgeUnitsService = {};
  const mockLessonsService = {};
  const mockStatsService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: FIRESTORE_CONNECTION, useValue: mockFirestore },
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: QuestionsService, useValue: mockQuestionsService },
        { provide: KnowledgeUnitsService, useValue: mockKnowledgeUnitsService },
        { provide: LessonsService, useValue: mockLessonsService },
        { provide: StatsService, useValue: mockStatsService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('SRS Transitions', () => {
    // Helper to access private method
    const getNextStage = (current: number, result: 'pass' | 'fail') => {
      return (service as any).calculateNextStage(current, result);
    };

    describe('Passing', () => {
      it('should advance by 1 for all stages up to 7', () => {
        expect(getNextStage(0, 'pass')).toBe(1);
        expect(getNextStage(1, 'pass')).toBe(2);
        expect(getNextStage(2, 'pass')).toBe(3);
        expect(getNextStage(3, 'pass')).toBe(4);
        expect(getNextStage(4, 'pass')).toBe(5);
        expect(getNextStage(5, 'pass')).toBe(6);
        expect(getNextStage(6, 'pass')).toBe(7);
        expect(getNextStage(7, 'pass')).toBe(8);
      });

      it('should cap at stage 8 (Mushin)', () => {
        expect(getNextStage(8, 'pass')).toBe(8);
      });
    });

    describe('Failing', () => {
      it('Stage 0 -> 0 (Initial)', () => {
        expect(getNextStage(0, 'fail')).toBe(0);
      });

      it('Stage 1 -> 1 (Sumi-suri reset)', () => {
        expect(getNextStage(1, 'fail')).toBe(1);
      });

      it('Stage 2 -> 1 (Sumi-suri reset)', () => {
        expect(getNextStage(2, 'fail')).toBe(1);
      });

      it('Stage 3 -> 1 (Sumi-suri reset)', () => {
        expect(getNextStage(3, 'fail')).toBe(1);
      });

      it('Stage 4 (Kaisho I) -> 2 (Sumi-suri III)', () => {
        expect(getNextStage(4, 'fail')).toBe(2);
      });

      it('Stage 5 (Kaisho II) -> 4 (Kaisho I)', () => {
        expect(getNextStage(5, 'fail')).toBe(4);
      });

      it('Stage 6 (Gyosho) -> 4 (Kaisho I)', () => {
        expect(getNextStage(6, 'fail')).toBe(4);
      });

      it('Stage 7 (Sosho) -> 6 (Gyosho)', () => {
        expect(getNextStage(7, 'fail')).toBe(6);
      });

      it('Stage 8 (Mushin) -> 6 (Gyosho)', () => {
        expect(getNextStage(8, 'fail')).toBe(6);
      });
    });
  });
});
