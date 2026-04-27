import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
  ParseIntPipe,
  BadRequestException,
  UseGuards
} from '@nestjs/common';
import { ScenariosService } from './scenarios.service';
import { GenerateScenarioDto, ChatTurnDto, ResetSessionDto } from '../types/scenario';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { ALLOWED_USER_ROLES, ALLOWED_AI_ROLES } from '../prompts/scenario.prompts';

@Controller('scenarios')
@UseGuards(FirebaseAuthGuard)
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) { }

  @Get('templates')
  getTemplates() {
    return this.scenariosService.getTemplates();
  }

  @Get('roles')
  getRoles() {
    return { userRoles: ALLOWED_USER_ROLES, aiRoles: ALLOWED_AI_ROLES };
  }

  @Post('generate')
  async generateScenario(@UserId() uid: string, @Body() dto: GenerateScenarioDto) {
    const id = await this.scenariosService.generateScenario(uid, dto);

    // FIX: Must return an object, not a raw string, so the frontend can parse it as JSON
    return { id };
  }

  @Get()
  async getAllScenarios(
    @UserId() uid: string,
    @Query('days') days?: string,
    @Query('sourceKuId') sourceKuId?: string,
    @Query('state') state?: string,
  ) {
    if (sourceKuId) {
      return this.scenariosService.getScenariosBySourceKuId(uid, sourceKuId);
    }
    const limitDays = days ? parseInt(days, 10) : undefined;
    if (limitDays !== undefined && isNaN(limitDays)) {
      throw new BadRequestException('Invalid days parameter');
    }
    return this.scenariosService.getAllScenarios(uid, limitDays, state);
  }

  @Get(':id/ku-status')
  async getKuStatus(@UserId() uid: string, @Param('id') id: string) {
    return this.scenariosService.getKuStatus(uid, id);
  }

  @Get(':id')
  async getScenario(@UserId() uid: string, @Param('id') id: string) {
    const scenario = await this.scenariosService.getScenario(uid, id);
    if (!scenario) {
      throw new HttpException('Scenario not found', HttpStatus.NOT_FOUND);
    }
    return scenario;
  }

  @Post(':id/advance')
  async advanceState(@UserId() uid: string, @Param('id') id: string) {
    return this.scenariosService.advanceState(uid, id);
  }

  @Post(':id/reset')
  async resetSession(@UserId() uid: string, @Param('id') id: string, @Body() body: ResetSessionDto) {
    await this.scenariosService.resetSession(uid, id, body.archive);
    return { success: true };
  }

  @Post(':id/deactivate')
  async deactivateScenario(@UserId() uid: string, @Param('id') id: string) {
    await this.scenariosService.deactivateScenario(uid, id);
    return { success: true };
  }

  @Post(':id/chat')
  async handleChat(@UserId() uid: string, @Param('id') id: string, @Body() dto: ChatTurnDto) {
    return this.scenariosService.handleChat(uid, id, dto.userMessage);
  }
}