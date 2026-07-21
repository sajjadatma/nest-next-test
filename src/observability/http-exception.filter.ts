import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : { message: 'Internal server error' };
    const message = typeof body === 'object' && body !== null && 'message' in body ? body.message : 'Internal server error';
    const requestId = response.getHeader('x-request-id')?.toString() ?? request.headers['x-request-id']?.toString();

    if (status >= 500) Sentry.captureException(exception, { extra: { requestId, path: request.url } });
    response.status(status).json({ statusCode: status, message, requestId, timestamp: new Date().toISOString() });
  }
}
