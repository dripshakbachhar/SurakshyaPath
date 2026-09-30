#!/usr/bin/env node

const { spawn } = require('node:child_process');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const child = spawn(process.execPath, ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
});

console.log('\nSurakshyaPath local host: http://localhost:' + port);
console.log('Press Ctrl+C to stop the server.\n');

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('exit', (code, signal) => {
  process.exit(signal ? 0 : (code ?? 0));
});
