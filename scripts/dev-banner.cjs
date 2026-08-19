const colors = require('colors/safe');

const line = colors.gray('────────────────────────────────────────────────────────');
const label = (name, value) => `${colors.bold(name.padEnd(13))}${value}`;

console.log(`\n${line}`);
console.log(colors.bold.cyan('  Drive development environment'));
console.log(line);
console.log(label('Preflight', colors.green('passed')));
console.log(label('API', colors.green('http://127.0.0.1:5050/api')));
console.log(label('Swagger', colors.cyan('http://127.0.0.1:5050/api/docs')));
console.log(label('Dashboard', colors.cyan('http://127.0.0.1:3000')));
console.log(label('PostgreSQL', colors.yellow('127.0.0.1:5433')));
console.log(colors.gray('\n  Press Ctrl+C to stop both services.\n'));
