import { Writable } from 'node:stream';
import pino from 'pino';
import { sensitiveLogRedactionPaths } from './app.module';

describe('HTTP log redaction', () => {
  it('removes request credentials and response cookies from structured logs', () => {
    const entries: string[] = [];
    const destination = new Writable({ write(chunk, _encoding, callback) { entries.push(chunk.toString()); callback(); } });
    const logger = pino({ redact: { paths: sensitiveLogRedactionPaths, remove: true } }, destination);
    const refreshToken = 'refresh-token-that-must-not-appear';

    logger.info({ req: { headers: { authorization: 'Bearer access-token', cookie: `refresh_token=${refreshToken}` } }, res: { headers: { 'set-cookie': `refresh_token=${refreshToken}; HttpOnly` } } }, 'session response');

    const output = entries.join('');
    expect(output).not.toContain('access-token');
    expect(output).not.toContain(refreshToken);
    expect(output).not.toContain('set-cookie');
  });
});
