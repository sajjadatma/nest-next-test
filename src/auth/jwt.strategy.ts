import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.getOrThrow<string>('JWT_SECRET') });
  }
  validate(payload: { sub?: unknown; email?: unknown; type?: unknown }) {
    if (payload.type !== 'access' || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email) {
      throw new UnauthorizedException('Invalid access token');
    }
    return { id: payload.sub, email: payload.email };
  }
}
