import { GET } from '../route';
import { db } from '@/lib/firebase';
import { KnowledgeUnit, ReviewFacet } from '@/types';
import { createRequest } from 'node-mocks-http';

// Mock the global fetch for the Gemini API call
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
        candidates: [{
            content: {
                parts: [{ text: '{"summary": "Test summary from Gemini"}' }]
            }
        }]
     }),
  })
) as jest.Mock;

import { initializeApp, getApps } from 'firebase-admin/app';

describe('GET /api/summarize-context', () => {
  beforeAll(async () => {
    if (!getApps().length) {
      initializeApp({
        projectId: 'aisrs-japanese-dev',
      });
    }
    // Clear collections
    const kus = await db.collection('kus').get();
    kus.forEach(doc => doc.ref.delete());
    const facets = await db.collection('review-facets').get();
    facets.forEach(doc => doc.ref.delete());

    // Seed data
    const ku1 = { id: 'ku1', content: '猫', type: 'Vocab' } as KnowledgeUnit;
    const ku2 = { id: 'ku2', content: '犬', type: 'Vocab' } as KnowledgeUnit;
    await db.collection('kus').doc('ku1').set(ku1);
    await db.collection('kus').doc('ku2').set(ku2);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const facet1: ReviewFacet = {
      id: 'facet1',
      kuId: 'ku1',
      facetType: 'Content-to-Definition',
      srsStage: 0,
      nextReviewAt: new Date().toISOString(),
      history: [
        { timestamp: yesterday.toISOString(), result: 'fail', stage: 0 },
        { timestamp: new Date().toISOString(), result: 'fail', stage: 0 },
        { timestamp: new Date().toISOString(), result: 'fail', stage: 0 },
        { timestamp: new Date().toISOString(), result: 'fail', stage: 0 },
      ],
    };
    const facet2: ReviewFacet = {
        id: 'facet2',
        kuId: 'ku2',
        facetType: 'Content-to-Definition',
        srsStage: 0,
        nextReviewAt: new Date().toISOString(),
        history: [
          { timestamp: yesterday.toISOString(), result: 'fail', stage: 0 },
        ],
      };

    await db.collection('review-facets').doc('facet1').set(facet1);
    await db.collection('review-facets').doc('facet2').set(facet2);
  });

  afterAll(async () => {
    // Clear collections
    const kus = await db.collection('kus').get();
    kus.forEach(doc => doc.ref.delete());
    const facets = await db.collection('review-facets').get();
    facets.forEach(doc => doc.ref.delete());
  });

  it('should return a summary from Gemini', async () => {
    const req = createRequest({
      method: 'GET',
      url: '/api/summarize-context',
    });

    // @ts-ignore
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary).toBe('Test summary from Gemini');
  });
});
