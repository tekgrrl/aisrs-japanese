import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Timestamp } from 'firebase-admin/firestore';
import { ApiLog } from '@/types';
import { performance } from 'perf_hooks';
import { ApilogService } from '../apilog/apilog.service';
import { computeClaudeCost, resolvePricing } from './claude-pricing';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeConverseResult {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

@Injectable()
export class ClaudeService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeService.name);

  private client: Anthropic;
  private modelName: string;
  private effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';

  constructor(
    private configService: ConfigService,
    private apilogService: ApilogService,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.modelName = this.configService.get<string>('CLAUDE_MODEL') || 'claude-sonnet-5';
    this.effort = (this.configService.get<string>('CLAUDE_EFFORT') as typeof this.effort) || 'high';

    const pricing = resolvePricing(this.modelName);
    this.logger.log(
      `Using Claude model: ${this.modelName} (effort: ${this.effort}) — priced at $${pricing.inputPerMTok}/$${pricing.outputPerMTok} per MTok in/out. Verify against https://platform.claude.com/docs/en/pricing if this looks stale.`,
    );

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not defined in environment variables');
    }

    this.client = new Anthropic({ apiKey });
  }

  async converse(
    systemPrompt: string,
    messages: ClaudeMessage[],
    opts?: { route?: string; maxTokens?: number; logContext?: Record<string, any> },
  ): Promise<ClaudeConverseResult> {
    const route = opts?.route ?? '/claude/converse';
    const maxTokens = opts?.maxTokens ?? 8192;

    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route,
      status: 'pending',
      modelUsed: this.modelName,
      requestData: {
        systemPrompt,
        userMessage: messages[messages.length - 1]?.content ?? '',
        ...opts?.logContext,
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);
    const startTime = performance.now();

    try {
      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: maxTokens,
        system: systemPrompt,
        output_config: { effort: this.effort },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      if (response.stop_reason === 'refusal') {
        throw new Error('Claude declined the request (safety classifier refusal)');
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      if (!text) {
        this.logger.error('Empty text response from Claude SDK', { response });
        throw new Error('Invalid response structure from Claude');
      }

      const cost = computeClaudeCost(response.model, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreation5mTokens: response.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
        cacheCreation1hTokens: response.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      });

      const result: ClaudeConverseResult = {
        text,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costUsd: cost.totalCostUsd,
        },
      };

      const durationMs = (performance.now() - startTime) / 1000;
      await this.apilogService.completeLog(logRef, {
        status: 'success',
        durationMs,
        responseData: { rawText: text, costUsd: cost.totalCostUsd },
      });

      return result;
    } catch (error) {
      let errorMessage = 'An unknown error occurred';
      let errorDetails: any = {};

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = { message: error.message, name: error.name, stack: error.stack };
      } else {
        errorDetails = { rawError: JSON.stringify(error) };
      }

      this.logger.error('Claude Service Error:', error);

      const durationMs = (performance.now() - startTime) / 1000;
      await this.apilogService.completeLog(logRef, {
        status: 'error',
        durationMs,
        errorData: errorDetails,
      });

      throw new InternalServerErrorException({ error: errorMessage, details: errorDetails });
    }
  }
}
