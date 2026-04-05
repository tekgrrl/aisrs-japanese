import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Local dev bypass logic
    if (process.env.NODE_ENV !== 'production') {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        this.logger.warn('Local dev mode: No Bearer token found. Bypassing auth and injecting user_default.');
        request.user = { uid: 'user_default' };
        return true;
      }

      try {
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        request.user = decodedToken;
        return true;
      } catch (error) {
        this.logger.warn(`Local dev mode: Token verification failed (${error.message}). Bypassing auth and injecting user_default.`);
        request.user = { uid: 'user_default' };
        return true;
      }
    }

    // Production logic
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.error('No valid Bearer token provided in headers');
      throw new UnauthorizedException('Missing authentication token');
    }

    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      request.user = decodedToken;
      return true;
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }
}
