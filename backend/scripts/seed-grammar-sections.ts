/**
 * Vertical-slice seed for the "Guide to Japanese Verbs" grammar-corpus feature.
 * Hand-enters 3 sections from the user's reference doc (one easy pattern, two
 * more awkward ones) directly into Firestore, to prove the grammar-pattern
 * scenario-generation directive end to end before writing a bulk extractor
 * for the remaining ~80 sections. See the "Guide to Japanese Verbs" plan.
 *
 * Run from backend/: npx ts-node -r tsconfig-paths/register scripts/seed-grammar-sections.ts
 * Idempotent — re-running updates existing docs by a stable slug id rather than duplicating.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FIRESTORE_CONNECTION, GRAMMAR_SECTIONS_COLLECTION } from '../src/firebase/firebase.module';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { GrammarSection } from '../src/types';

const SECTIONS: Array<Omit<GrammarSection, 'id' | 'createdAt'> & { slug: string }> = [
  {
    slug: 'base3-deshou',
    sectionLabel: '6.1 Lesson 24 - "Perhaps / Probably" Base 3 + でしょう',
    pattern: 'Base 3 + でしょう',
    jlptLevel: 'N5',
    explanation:
      'でしょう attaches to the plain (Base 3 / dictionary) form of a verb, or directly to an adjective or noun, to soften a statement into a guess or probability — "probably ~" / "I guess ~". Rising intonation turns it into "I wonder if ~?". It is the plain-form-friendly, slightly more tentative cousin of だろう used in polite speech.',
    examples: [
      { japanese: '明日は雨が降るでしょう。', english: 'It will probably rain tomorrow.' },
      { japanese: '田中さんはもう帰ったでしょう。', english: 'Mr. Tanaka has probably already gone home.' },
      { japanese: '彼はまだ学生でしょう。', english: 'He is probably still a student.' },
    ],
    vocab: [
      { term: '降る', reading: 'ふる', meaning: 'to fall (rain/snow)' },
      { term: '帰る', reading: 'かえる', meaning: 'to return home' },
      { term: '学生', reading: 'がくせい', meaning: 'student' },
    ],
    notes: 'Distinguish from か + でしょう ("I wonder if"), which is a question directed inward rather than a statement of probability.',
  },
  {
    slug: 'ta-form-bakari',
    sectionLabel: '10.3 Lesson 75 - た form + ばかり',
    pattern: 'た form + ばかり',
    jlptLevel: 'N4',
    explanation:
      'た form + ばかり means "just did ~" — emphasizing that an action was completed very recently, from the speaker\'s subjective sense of "recently," not a strict clock measurement. It differs from plain past tense by foregrounding the freshness of the event, often explaining a current state (e.g. why something is still hot, why someone is still tired).',
    examples: [
      { japanese: '今、着いたばかりです。', english: "I just arrived." },
      { japanese: 'このパンは焼いたばかりだから、まだ熱いよ。', english: 'This bread was just baked, so it\'s still hot.' },
      { japanese: '日本語を習い始めたばかりで、まだ上手じゃない。', english: "I just started learning Japanese, so I'm not good at it yet." },
    ],
    vocab: [
      { term: '着く', reading: 'つく', meaning: 'to arrive' },
      { term: '焼く', reading: 'やく', meaning: 'to bake, cook, burn' },
      { term: '習う', reading: 'ならう', meaning: 'to learn, study' },
    ],
    notes: 'ばかり here is subjective — "just" can mean five minutes ago or, for a big life event, even a few months ago, depending on the speaker\'s sense of recency.',
  },
  {
    slug: 'base1-zuni',
    sectionLabel: '10.x Base 1 + ずに',
    pattern: 'Base 1 + ずに',
    jlptLevel: 'N3',
    explanation:
      'Base 1 + ずに means "without doing ~" and modifies the following clause, functioning like ないで but in a more literary/written register. する is the one irregular case: it becomes せずに, not しずに. Common in narration and slightly formal speech; ないで is more natural in casual conversation.',
    examples: [
      { japanese: '朝ご飯を食べずに学校に行った。', english: 'I went to school without eating breakfast.' },
      { japanese: '彼は何も言わずに部屋を出た。', english: 'He left the room without saying anything.' },
      { japanese: '辞書を使わずにこの記事を読んでみて。', english: 'Try reading this article without using a dictionary.' },
    ],
    vocab: [
      { term: '朝ご飯', reading: 'あさごはん', meaning: 'breakfast' },
      { term: '出る', reading: 'でる', meaning: 'to leave, exit' },
      { term: '辞書', reading: 'じしょ', meaning: 'dictionary' },
    ],
    notes: 'する → せずに is the one irregular conjugation to flag; everything else follows regular Base 1 rules.',
  },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get<Firestore>(FIRESTORE_CONNECTION);

  for (const { slug, ...data } of SECTIONS) {
    await db.collection(GRAMMAR_SECTIONS_COLLECTION).doc(slug).set({
      ...data,
      createdAt: Timestamp.now(),
    }, { merge: true });
    console.log(`  seeded grammar section: ${slug} ("${data.pattern}")`);
  }

  console.log(`\nDone. Seeded ${SECTIONS.length} grammar sections.`);
  await app.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
