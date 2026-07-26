import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Request, Response } from 'express';
import { SystemLogService } from '../system-logs/system-log.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly systemLogs: SystemLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : { message: 'Internal server error' };
    const message = typeof body === 'object' && body !== null && 'message' in body ? body.message : 'Internal server error';
    const requestId = response.getHeader('x-request-id')?.toString() ?? request.headers['x-request-id']?.toString();

    if (status >= 500) Sentry.captureException(exception, { extra: { requestId, path: request.url } });
    void this.systemLogs.record({ severity: status >= 500 ? 'error' : 'warning', category: 'api', message: Array.isArray(message) ? message.join(', ') : String(message), requestId, path: request.path, statusCode: status, actorId: (request.user as { id?: string } | undefined)?.id });
    response.status(status).json({ statusCode: status, message, requestId, timestamp: new Date().toISOString() });
  }
}
