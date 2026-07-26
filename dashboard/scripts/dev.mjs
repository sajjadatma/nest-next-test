import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const next = spawn(
  process.execPath,
  [resolve(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1'],
  { stdio: ['inherit', 'pipe', 'pipe'] },
);

let announced = false;
const muted = [/^\s*▲ Next\.js/, /^\s*- Local:/, /^\s*- Network:/, /^\s*✓ Starting/, /^\s*✓ Ready in/];

function print(stream, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (!line) continue;
    if (/Ready in/.test(line)) {
      if (!announced) {
        announced = true;
        console.log('Frontend is ready: http://127.0.0.1:3000');
      }
      continue;
    }
    if (!muted.some((pattern) => pattern.test(line))) stream.write(`${line}\n`);
  }
}

next.stdout.on('data', (chunk) => print(process.stdout, chunk));
next.stderr.on('data', (chunk) => print(process.stderr, chunk));
next.on('exit', (code) => process.exit(code ?? 0));
