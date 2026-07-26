import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(http.post('http://127.0.0.1:5050/api/auth/refresh', () => HttpResponse.json({ message: 'No active session' }, { status: 401 })));
