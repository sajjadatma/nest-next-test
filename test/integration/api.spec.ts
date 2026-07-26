import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('API integration', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns validation errors for invalid registration input', async () => {
    const response = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'invalid', password: 'short', unexpected: true });
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(expect.any(Array));
  });

  it('registers, authenticates, and exposes a protected dashboard', async () => {
    const registration = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'integration@example.com', password: 'password123', name: 'Integration User' });
    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({ email: 'integration@example.com', name: 'Integration User' });
    token = registration.body.accessToken;

    await expect(request(app.getHttpServer()).get('/api/dashboard')).resolves.toMatchObject({ status: 401 });
    const dashboard = await request(app.getHttpServer()).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.metrics[0]).toEqual({ label: 'Registered users', value: 1 });
  });

  it('handles duplicate registrations, unauthorized login, and forbidden administration', async () => {
    await expect(request(app.getHttpServer()).post('/api/auth/register').send({ email: 'integration@example.com', password: 'password123' })).resolves.toMatchObject({ status: 409 });
    await expect(request(app.getHttpServer()).post('/api/auth/login').send({ email: 'integration@example.com', password: 'wrong-password' })).resolves.toMatchObject({ status: 401 });
    await expect(request(app.getHttpServer()).get('/api/admin/users').set('Authorization', `Bearer ${token}`)).resolves.toMatchObject({ status: 403 });
  });

  it('updates profile data for the authenticated user', async () => {
    const response = await request(app.getHttpServer()).patch('/api/auth/me').set('Authorization', `Bearer ${token}`).send({ name: 'Updated User' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Updated User', roles: ['user'], permissions: ['dashboard:read'] });
  });

  it('throttles repeated authentication attempts', async () => {
    const attempts = await Promise.all(Array.from({ length: 6 }, () => request(app.getHttpServer()).post('/api/auth/login').send({ email: 'integration@example.com', password: 'wrong-password' })));
    expect(attempts.some((response) => response.status === 429)).toBe(true);
  });
});
