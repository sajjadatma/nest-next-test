import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = { id: string; email: string } | null>(error: unknown, user: TUser): TUser | null {
    if (error) return null;
    return user ?? null;
  }

  canActivate(context: ExecutionContext) { return super.canActivate(context); }
}
