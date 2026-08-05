/**
 * Agentic model-comparison harness for the tutor scenario-generation task.
 *
 * An Opus 5 orchestrator (via the SDK's tool runner) decides what to test,
 * runs real generate-scenario calls against different provider/model configs
 * through the app's own TutorService, has an independent Opus 5 judge score
 * each result, and writes its own comparison report.
 *
 * Run from backend/: npx ts-node -r tsconfig-paths/register scripts/model-eval-harness.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { AppModule } from '../src/app.module';
import { TutorService } from '../src/tutor/tutor.service';
import { TutorToolExecutor } from '../src/tutor/tutor-tool.executor';
import { ApilogService } from '../src/apilog/apilog.service';
import { ClaudeProvider } from '../src/tutor/providers/claude.provider';
import { GeminiProvider } from '../src/tutor/providers/gemini.provider';
import { FIRESTORE_CONNECTION } from '../src/firebase/firebase.module';
import type { Firestore } from 'firebase-admin/firestore';

const ORCHESTRATOR_MODEL = 'claude-opus-5';
const JUDGE_MODEL = 'claude-opus-5';
const MAX_GENERATIONS = 8;
const TEST_UID = 'user_default';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fakeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get<Firestore>(FIRESTORE_CONNECTION);
  const executor = app.get(TutorToolExecutor);
  const apilogService = app.get(ApilogService);

  let generationCount = 0;
  const findings: Record<string, unknown>[] = [];

  async function buildProvider(providerName: string, model: string, effort?: string) {
    if (providerName === 'claude') {
      const provider = new ClaudeProvider(
        fakeConfig({
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
          CLAUDE_MODEL: model,
          CLAUDE_EFFORT: effort ?? 'high',
        }) as any,
      );
      provider.onModuleInit();
      return provider;
    }
    const provider = new GeminiProvider(
      fakeConfig({
        GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
        MODEL_GEMINI_FLASH: model,
      }) as any,
    );
    provider.onModuleInit();
    return provider;
  }

  const runScenarioGeneration = betaTool({
    name: 'run_scenario_generation',
    description:
      'Generate one Japanese learning scenario using a specific AI provider/model config, through the real app pipeline. Returns cost, latency, and iteration count. Each call incurs real API cost — a hard cap applies, use calls deliberately.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['gemini', 'claude'] },
        model: {
          type: 'string',
          description: 'e.g. claude-sonnet-5, claude-opus-5, gemini-3.6-flash, gemini-3.5-flash',
        },
        effort: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'xhigh', 'max'],
          description: 'Claude only; ignored for Gemini',
        },
        theme: { type: 'string', description: 'Scenario theme, e.g. "ordering coffee"' },
      },
      required: ['provider', 'model', 'theme'],
    },
    run: async (input) => {
      if (generationCount >= MAX_GENERATIONS) {
        return JSON.stringify({
          error: `Generation cap of ${MAX_GENERATIONS} reached. Stop testing now and write your final report.`,
        });
      }
      generationCount++;

      try {
        const provider = await buildProvider(input.provider, input.model, input.effort);
        const tutorService = new TutorService(provider as any, executor, apilogService);
        const start = Date.now();
        const scenarioId = await tutorService.generateScenario(TEST_UID, { theme: input.theme });
        const durationMs = Date.now() - start;

        // Exact match on scenarioId, not "most recent N" — the latter races
        // when multiple generations run close together.
        const logSnap = await db
          .collection('api-logs')
          .where('responseData.scenarioId', '==', scenarioId)
          .limit(1)
          .get();
        const responseData = logSnap.docs[0]?.data().responseData ?? {};

        return JSON.stringify({
          scenarioId,
          durationMs,
          costUsd: responseData.costUsd ?? null,
          iterationCount: responseData.iterationCount ?? null,
        });
      } catch (err: any) {
        return JSON.stringify({ error: err.message ?? String(err) });
      }
    },
  });

  const judgeScenario = betaTool({
    name: 'judge_scenario',
    description:
      'Score a generated scenario against a fixed rubric, using an independent judge model separate from whatever generated it. Always call after run_scenario_generation.',
    inputSchema: {
      type: 'object',
      properties: { scenarioId: { type: 'string' } },
      required: ['scenarioId'],
    },
    run: async (input) => {
      const doc = await db.collection('scenarios').doc(input.scenarioId).get();
      if (!doc.exists) return JSON.stringify({ error: 'Scenario not found' });

      const judgeResponse = await anthropic.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 1024,
        system:
          'You are an expert Japanese-language pedagogy judge scoring a generated learning scenario. Score 1-5 on each dimension.',
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                naturalness: { type: 'integer', description: 'Does the Japanese read as something a native speaker would actually say?' },
                level_appropriateness: { type: 'integer', description: 'Is vocab/grammar consistent with the stated difficultyLevel?' },
                personalization: { type: 'integer', description: "Does it look like it used the learner's own vocab/grammar context, vs generic textbook content?" },
                justification: { type: 'string' },
              },
              required: ['naturalness', 'level_appropriateness', 'personalization', 'justification'],
              additionalProperties: false,
            },
          },
        },
        messages: [{ role: 'user', content: JSON.stringify(doc.data(), null, 2) }],
      });

      const text = judgeResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return text;
    },
  });

  const recordFinding = betaTool({
    name: 'record_finding',
    description: 'Record one row in the comparison results table. Call once per (config, sample) after generating and judging. Include the judge\'s full justification text, not just the scores.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        effort: { type: 'string' },
        theme: { type: 'string' },
        scenarioId: { type: 'string' },
        costUsd: { type: 'number' },
        durationMs: { type: 'number' },
        iterationCount: { type: 'number' },
        naturalness: { type: 'number' },
        levelAppropriateness: { type: 'number' },
        personalization: { type: 'number' },
        justification: { type: 'string', description: "The judge's full explanation for its scores, verbatim." },
      },
      required: ['provider', 'model', 'costUsd', 'durationMs', 'justification'],
    },
    run: async (input) => {
      findings.push(input);
      console.log(`  recorded: ${input.provider}/${input.model} — $${input.costUsd}, ${input.durationMs}ms`);
      return JSON.stringify({ recorded: true, totalFindings: findings.length });
    },
  });

  const kickoff = `Compare these AI model configs on the Japanese tutor scenario-generation task:
- gemini, model gemini-3.6-flash
- gemini, model gemini-3.5-flash
- claude, model claude-sonnet-5, effort high
- claude, model claude-opus-5, effort high

For each config: run 2 samples with different everyday themes (e.g. ordering coffee, buying a train ticket, asking for directions, checking into a hotel), judge each result, and record_finding for each — always include the scenarioId and the judge's full justification text in record_finding, not just the numeric scores. You have a hard cap of ${MAX_GENERATIONS} total generations across the whole run (this matrix needs exactly 8) — budget accordingly. Run one generation at a time, in sequence, not in parallel. When done, write a final summary comparing the configs on cost, latency, and judge scores, and state which config you'd recommend and why.`;

  console.log('Starting orchestrator...\n');

  const runner = anthropic.beta.messages.toolRunner({
    model: ORCHESTRATOR_MODEL,
    max_tokens: 8000,
    max_iterations: 40,
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    system:
      'You are running a rigorous, economical model-comparison harness. You have a hard cap on generations — plan your test matrix before calling any tools. Run tests one at a time, never in parallel — concurrent generations produce misleading latency numbers.',
    tools: [runScenarioGeneration, judgeScenario, recordFinding],
    messages: [{ role: 'user', content: kickoff }],
  });

  const final = await runner.runUntilDone();

  console.log('\n=== ORCHESTRATOR FINAL REPORT ===\n');
  for (const block of final.content) {
    if (block.type === 'text') console.log(block.text);
  }

  console.log('\n=== RAW FINDINGS TABLE ===\n');
  console.table(findings.map(({ justification, ...rest }) => rest));

  const reportPath = writeMarkdownReport(final, findings);
  console.log(`\nFull report with judge justifications written to ${reportPath}`);

  await app.close();
}

function writeMarkdownReport(final: Anthropic.Beta.BetaMessage, findings: Record<string, unknown>[]): string {
  const reportsDir = path.join(__dirname, 'eval-reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.md`);

  const finalText = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const findingsSection = findings
    .map((f, i) => {
      const { justification, ...rest } = f as { justification?: string; [k: string]: unknown };
      return `### ${i + 1}. ${rest.provider}/${rest.model} — "${rest.theme}"\n\n${Object.entries(rest)
        .map(([k, v]) => `- **${k}**: ${v}`)
        .join('\n')}\n\n**Judge's justification:** ${justification ?? '(none recorded)'}\n`;
    })
    .join('\n');

  const content = `# Model Eval Report — ${new Date().toISOString()}\n\n## Orchestrator's Final Report\n\n${finalText}\n\n## Per-Scenario Detail\n\n${findingsSection}`;
  fs.writeFileSync(reportPath, content);
  return reportPath;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
