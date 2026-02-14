import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { ScenariosService } from './scenarios.service';
import { GenerateScenarioDto, ChatTurnDto } from '../types/scenario';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) { }

  @Post('generate')
  async generateScenario(@Body() dto: GenerateScenarioDto) {
    const userId = 'default-user';
    const id = await this.scenariosService.generateScenario(userId, dto);

    // FIX: Must return an object, not a raw string, so the frontend can parse it as JSON
    return { id };
  }

  @Get()
  async getAllScenarios() {
    const userId = 'default-user';
    return this.scenariosService.getAllScenarios(userId);
  }

  @Get(':id')
  async getScenario(@Param('id') id: string) {
    const scenario = await this.scenariosService.getScenario(id);
    if (!scenario) {
      throw new HttpException('Scenario not found', HttpStatus.NOT_FOUND);
    }
    return scenario;
  }

  @Post(':id/advance')
  async advanceState(@Param('id') id: string) {
    return this.scenariosService.advanceState(id);
  }

  @Post(':id/reset')
  async resetSession(@Param('id') id: string) {
    await this.scenariosService.resetSession(id);
    return { success: true };
  }

  @Post(':id/chat')
  async handleChat(@Param('id') id: string, @Body() dto: ChatTurnDto) {
    return this.scenariosService.handleChat(id, dto.userMessage);
  }
}