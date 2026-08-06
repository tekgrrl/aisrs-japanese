/**
 * Creates a disposable synthetic test user — no real Firebase Auth signup needed,
 * just a `users/{uid}` doc plus a handful of enrolled Grammar KUs (so
 * get_grammar_patterns has a non-empty pool to work with). Use with the app's
 * existing dev-auth-bypass to drive the frontend as this user:
 *
 *   NEXT_PUBLIC_DEV_SKIP_AUTH=true NEXT_PUBLIC_DEV_USER_ID=<uid> yarn dev   (in /frontend)
 *
 * Run from backend/: npx ts-node -r tsconfig-paths/register scripts/create-test-user.ts [uid] [jlptLevel]
 * Clean up afterwards with scripts/delete-test-user.ts.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UserService } from '../src/users/user.service';
import { UserKnowledgeUnitsService } from '../src/user-knowledge-units/user-knowledge-units.service';
import { KnowledgeUnitsService } from '../src/knowledge-units/knowledge-units.service';

const GRAMMAR_SEED_COUNT = 5;

async function main() {
  const uid = process.argv[2] ?? `test-${Date.now()}`;
  const jlptLevel = process.argv[3] ?? 'N4';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const userService = app.get(UserService);
  const userKnowledgeUnitsService = app.get(UserKnowledgeUnitsService);
  const knowledgeUnitsService = app.get(KnowledgeUnitsService);

  await userService.findOrCreate(uid);
  await userService.updatePreferences(uid, { jlptLevel });
  console.log(`Created users/${uid} (jlptLevel=${jlptLevel})`);

  const grammarKus = await knowledgeUnitsService.findAll({ type: 'Grammar', jlptLevel });
  const toEnroll = grammarKus.slice(0, GRAMMAR_SEED_COUNT);
  for (const ku of toEnroll) {
    await userKnowledgeUnitsService.create(uid, ku.id);
  }
  console.log(`Enrolled ${toEnroll.length} Grammar KU(s): ${toEnroll.map(k => k.content).join(', ') || '(none found at this level)'}`);

  console.log(`\nTest user ready: ${uid}`);
  console.log(`Run the frontend against it:\n  NEXT_PUBLIC_DEV_SKIP_AUTH=true NEXT_PUBLIC_DEV_USER_ID=${uid} yarn dev`);
  console.log(`\nClean up when done:\n  npx ts-node -r tsconfig-paths/register scripts/delete-test-user.ts ${uid}`);

  await app.close();
}

main().catch(err => { console.error(err); process.exit(1); });
