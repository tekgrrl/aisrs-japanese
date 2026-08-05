import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AiProvider,
  AiMessage,
  AiMessagePart,
  AiToolDefinition,
  AiToolCall,
  AiResponse,
} from './ai-provider.interface';
import { computeClaudeCost } from '../../claude/claude-pricing';

@Injectable()
export class ClaudeProvider extends AiProvider implements OnModuleInit {
  private readonly logger = new Logger(ClaudeProvider.name);
  private client: Anthropic;
  private modelName: string;
  private effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  get modelLabel(): string { return this.modelName; }

  constructor(private readonly configService: ConfigService) { super(); }

  onModuleInit() {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY')!;
    this.modelName = this.configService.get<string>('CLAUDE_MODEL') ?? 'claude-sonnet-5';
    this.effort = (this.configService.get<string>('CLAUDE_EFFORT') as typeof this.effort) ?? 'high';
    this.client = new Anthropic({ apiKey });
  }

  async chat({
    system,
    messages,
    tools,
  }: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDefinition[];
  }): Promise<AiResponse> {
    const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => this.toMessageParam(msg));
    const anthropicTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    this.logger.debug(`chat: ${messages.length} messages, ${tools.length} tools`);

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: 16000,
      system,
      output_config: { effort: this.effort },
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined the request (safety classifier refusal)');
    }

    const cost = computeClaudeCost(response.model, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreation5mTokens: response.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
      cacheCreation1hTokens: response.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });
    this.logger.debug(`turn cost: $${cost.totalCostUsd.toFixed(4)}`);

    const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

    if (toolUseBlocks.length > 0) {
      const calls: AiToolCall[] = toolUseBlocks.map(block => ({
        callId: block.id,
        name: block.name,
        args: (block.input ?? {}) as Record<string, unknown>,
      }));

      // Preserve the raw Claude content blocks (including any thinking blocks)
      // so the next turn can echo them back verbatim — required for adaptive
      // thinking continuity on the same model, same reasoning as Gemini's
      // thought_signature preservation.
      const modelTurn: AiMessage = {
        role: 'model',
        parts: response.content
          .filter(block => block.type === 'text' || block.type === 'tool_use')
          .map(block =>
            block.type === 'tool_use'
              ? { type: 'tool_call' as const, callId: block.id, name: block.name, args: (block.input ?? {}) as Record<string, unknown> }
              : { type: 'text' as const, text: (block as Anthropic.TextBlock).text },
          ),
        _raw: response.content,
      };

      this.logger.debug(`tool_use: ${calls.map(c => c.name).join(', ')}`);
      return { type: 'tool_use', calls, modelTurn };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    this.logger.debug(`end_turn: ${text.length} chars`);
    return { type: 'end_turn', content: text };
  }

  private toMessageParam(msg: AiMessage): Anthropic.MessageParam {
    const role = msg.role === 'model' ? 'assistant' : 'user';
    if (msg._raw) {
      return { role, content: msg._raw as Anthropic.ContentBlockParam[] };
    }
    return { role, content: msg.parts.map(p => this.toContentBlock(p)) };
  }

  private toContentBlock(part: AiMessagePart): Anthropic.ContentBlockParam {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'tool_call':
        return { type: 'tool_use', id: part.callId, name: part.name, input: part.args };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: part.callId,
          content: typeof part.result === 'string' ? part.result : JSON.stringify(part.result),
        };
    }
  }
}
