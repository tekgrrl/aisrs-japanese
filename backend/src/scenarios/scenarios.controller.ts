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
    // In a real app, userId would come from a guard/decorator
    const userId = 'default-user';
    return this.scenariosService.generateScenario(userId, dto);
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

  @Post(':id/chat')
  async handleChat(@Param('id') id: string, @Body() dto: ChatTurnDto) {
    return this.scenariosService.handleChat(id, dto.userMessage);
  }
}