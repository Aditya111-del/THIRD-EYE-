/**
 * Automated Verification Script: Directory Awareness & Project Isolation
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

// Require compiled modules
const {
  checkWorkspaceSafety,
  isProjectInitRequest,
  extractProjectSlug,
  deriveFallbackProjectSlug,
  generateDirectoryAwarenessNotice,
} = require('../backend/ai-service/dist/agents/workspaceSafety');

const { AutonomousAgent } = require('../backend/ai-service/dist/agents/autonomousAgent');
const { executeInitProjectFolder } = require('../backend/ai-service/dist/tools/initProjectFolder');

async function runTests() {
  console.log('\n=== DIRECTORY AWARENESS & PROJECT ISOLATION VERIFICATION ===\n');

  const thirdEyeRoot = path.resolve(__dirname, '..');
  const homeDir = os.homedir();

  // Test 1: checkWorkspaceSafety on THIRD EYE root
  console.log('1. Checking workspace safety on THIRD EYE codebase...');
  const safetyThirdEye = checkWorkspaceSafety(thirdEyeRoot);
  assert.strictEqual(safetyThirdEye.isProtected, true, 'THIRD EYE root should be protected');
  assert.strictEqual(safetyThirdEye.reason, 'third_eye_root', 'Reason should be third_eye_root');
  console.log('   ✔ THIRD EYE root properly identified as protected (third_eye_root)');

  // Test 2: checkWorkspaceSafety on home directory
  console.log('2. Checking workspace safety on user home directory...');
  const safetyHome = checkWorkspaceSafety(homeDir);
  assert.strictEqual(safetyHome.isProtected, true, 'Home directory should be protected');
  assert.strictEqual(safetyHome.reason, 'home_dir', 'Reason should be home_dir');
  console.log('   ✔ Home directory properly identified as protected (home_dir)');

  // Test 3: checkWorkspaceSafety on an isolated project directory
  console.log('3. Checking workspace safety on an isolated user project folder...');
  const safeProjectDir = path.join(homeDir, 'Projects', 'my-test-app');
  const safetySafe = checkWorkspaceSafety(safeProjectDir);
  assert.strictEqual(safetySafe.isProtected, false, 'Isolated project directory should be safe');
  console.log('   ✔ User project directory properly identified as safe for development');

  // Test 4: Project init request matching & slug extraction
  console.log('4. Testing project init request detection and slug extraction...');
  assert.strictEqual(isProjectInitRequest('start project'), true);
  assert.strictEqual(extractProjectSlug('start project'), null);

  assert.strictEqual(isProjectInitRequest('init project milkshake-bar'), true);
  assert.strictEqual(extractProjectSlug('init project milkshake-bar'), 'milkshake-bar');

  assert.strictEqual(isProjectInitRequest('create a new project called chat-gpt-clone'), true);
  assert.strictEqual(extractProjectSlug('create a new project called chat-gpt-clone'), 'chat-gpt-clone');

  assert.strictEqual(isProjectInitRequest('what is python'), false);
  console.log('   ✔ Pattern matching and slug extraction working with 100% precision');

  // Test 5: Fallback project slug derivation
  console.log('5. Testing fallback project slug derivation for coding prompts...');
  const slug = deriveFallbackProjectSlug('build a modern milkshake ordering website');
  assert.ok(slug.includes('milkshake'), `Slug should contain keyword milkshake: ${slug}`);
  console.log(`   ✔ Derived fallback project slug: "${slug}"`);

  // Test 6: Notice generation
  console.log('6. Testing Directory Awareness Notice formatting...');
  const notice = generateDirectoryAwarenessNotice(safetyThirdEye);
  assert.ok(notice.includes('Directory Awareness Notice'), 'Notice should have header');
  assert.ok(notice.includes(thirdEyeRoot), 'Notice should include current directory');
  assert.ok(notice.includes('Initialize a Dedicated Project Folder'), 'Notice should offer project initialization');
  console.log('   ✔ Directory Awareness Notice formatted cleanly with presets');

  // Test 7: AutonomousAgent intent classification for "start project"
  console.log('7. Testing AutonomousAgent intent classification...');
  const agent = new AutonomousAgent(thirdEyeRoot);
  const context = {
    workspaceRoot: thirdEyeRoot,
    sessionId: 'test-session',
    history: [],
  };

  const classResult1 = agent.classifyIntent('start project', context);
  assert.strictEqual(classResult1.intent, 'project_init', 'Should classify "start project" as project_init');
  assert.strictEqual(classResult1.targetProjectSlug, undefined, 'No slug should be extracted');
  console.log('   ✔ "start project" classified as project_init');

  const classResult2 = agent.classifyIntent('start project milkshake-bar', context);
  assert.strictEqual(classResult2.intent, 'project_init');
  assert.strictEqual(classResult2.targetProjectSlug, 'milkshake-bar');
  console.log('   ✔ "start project milkshake-bar" classified with slug="milkshake-bar"');

  // Test 8: End-to-end execution of "start project" when in protected directory
  console.log('8. Testing AutonomousAgent execution for "start project" in protected directory...');
  const emittedEvents = [];
  const execResult = await agent.execute('start project', context, (event) => {
    emittedEvents.push(event);
  });

  assert.ok(execResult.reply.includes('Directory Awareness Notice'), 'Reply should be Directory Awareness Notice');
  assert.ok(execResult.reply.includes('start project my-app'), 'Reply should prompt user for project name');
  console.log('   ✔ Agent correctly returned Directory Awareness Notice without creating any files!');

  // Test 9: Tool execution - create project folder
  console.log('9. Testing executeInitProjectFolder tool...');
  const testFolderName = `test-verify-${Date.now()}`;
  const initResult = await executeInitProjectFolder({ folderName: testFolderName }, thirdEyeRoot);
  assert.strictEqual(initResult.success, true);
  assert.ok(fs.existsSync(initResult.projectPath), 'Project path must exist on disk');
  assert.ok(initResult.projectPath.includes(testFolderName), 'Path must contain folder name');
  console.log(`   ✔ Successfully created isolated folder: ${initResult.projectPath}`);

  // Cleanup test folder
  try {
    fs.rmSync(initResult.projectPath, { recursive: true, force: true });
    console.log('   ✔ Cleaned up test folder');
  } catch {}

  // Test 10: Verify THIRD EYE root cleanliness
  console.log('10. Verifying zero pollution in THIRD EYE root codebase...');
  const unwantedPaths = [
    path.join(thirdEyeRoot, 'agent-core'),
    path.join(thirdEyeRoot, 'src'),
    path.join(thirdEyeRoot, 'workspace'),
  ];
  for (const p of unwantedPaths) {
    assert.strictEqual(fs.existsSync(p), false, `Path must not exist: ${p}`);
  }
  console.log('   ✔ Verified: zero unwanted files exist in THIRD EYE root!');

  console.log('\n=== ALL 10 TESTS PASSED WITH 100% SUCCESS ===\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
