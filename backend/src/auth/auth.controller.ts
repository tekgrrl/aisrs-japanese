import { Controller, Get, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { UserId } from './user-id.decorator';

@Controller('auth')
export class AuthController {
  @Get('test')
  @UseGuards(FirebaseAuthGuard)
  testAuth(@UserId() uid: string) {
    return {
      message: 'Auth successful',
      uid: uid,
    };
  }
}
