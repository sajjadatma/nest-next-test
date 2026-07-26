import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('health probes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('reports liveness and PostgreSQL readiness', async () => {
    await expect(request(app.getHttpServer()).get('/api/health/live')).resolves.toMatchObject({ status: 200, body: { status: 'ok', service: 'api' } });
    await expect(request(app.getHttpServer()).get('/api/health/ready')).resolves.toMatchObject({ status: 200, body: { status: 'ok', database: 'up' } });
  });
});
