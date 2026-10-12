/**
 * PTY Service Production Runner (Phase 3)
 * Loads and starts compiled TypeScript server with Ring Buffer & Session Registry.
 */

try {
  const ptyServer = require('./dist/server');
  if (typeof ptyServer.startPtyServer === 'function') {
    ptyServer.startPtyServer();
  }
} catch (err) {
  console.log('[PTY Service] dist/server.js not found, running build...', err.message);
  try {
    require('child_process').execSync('npx tsc', { cwd: __dirname, stdio: 'inherit' });
    const ptyServer = require('./dist/server');
    if (typeof ptyServer.startPtyServer === 'function') {
      ptyServer.startPtyServer();
    }
  } catch (buildErr) {
    console.error('[PTY Service] Build error:', buildErr);
    process.exit(1);
  }
}
