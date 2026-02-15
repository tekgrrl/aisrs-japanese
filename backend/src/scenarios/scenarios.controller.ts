import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
  ParseIntPipe
} from '@nestjs/common';
import { ScenariosService } from './scenarios.service';
import { GenerateScenarioDto, ChatTurnDto } from '../types/scenario';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) { }

  @Get('templates')
  getTemplates() {
    return this.scenariosService.getTemplates();
  }

  @Post('generate')
  async generateScenario(@Body() dto: GenerateScenarioDto) {
    const userId = 'default-user';
    const id = await this.scenariosService.generateScenario(userId, dto);

    // FIX: Must return an object, not a raw string, so the frontend can parse it as JSON
    return { id };
  }

  @Get()
  async getAllScenarios(@Query('days') days?: string) {
    const userId = 'default-user';
    const limitDays = days ? parseInt(days, 10) : undefined;
    return this.scenariosService.getAllScenarios(userId, limitDays);
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
  async resetSession(@Param('id') id: string, @Body() body: { archive: boolean }) {
    await this.scenariosService.resetSession(id, body.archive);
    return { success: true };
  }

  @Post(':id/chat')
  async handleChat(@Param('id') id: string, @Body() dto: ChatTurnDto) {
    return this.scenariosService.handleChat(id, dto.userMessage);
  }
}