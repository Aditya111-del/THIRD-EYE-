---
name: cli-tools-and-developer-utilities
description: Build polished, ergonomic, high-performance command-line interfaces and developer utilities across Node.js, Go, Rust, and Python
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# CLI Tools & Developer Utilities Mastery Skill

## Core Philosophy: Developer Ergonomics, Instant Feedback, Beautiful Output
A command-line tool must be intuitive, self-documenting, fast to execute, and visually pleasant. It should feel like elite CLI tools such as `gh`, `stripe`, `bun`, or `turborepo`.

---

## 1. Zero-Stub & CLI Architecture Mandate
- **NEVER create a CLI tool that crashes with raw stack traces on user input errors.**
- **Full Architecture Requirements**:
  1. **Option & Argument Parsing**: Robust flag and positional argument parsing with types, defaults, descriptions, and alias support (e.g. `-v, --version`, `-h, --help`, `-o, --output <dir>`).
  2. **Self-Documenting Help Menus**: Clear usage guides, example commands, descriptions for every flag, and categorized subcommand groups.
  3. **Visual Aesthetics & Polish**:
     - Modern color palette: Use muted cyan/blue for info, bright green for success, amber for warnings, crimson for errors.
     - Spinners & Progress: Indeterminate spinners for network/disk operations (`ora` / `indicatif`), percentage progress bars for downloads or file processing.
     - Formatted Output: Tabular data displayed in clean Unicode tables (`cli-table3`).
  4. **Interactive Prompts**: Support wizard-style interactive questionnaires (text inputs, single select with arrow keys, multi-select checkboxes) when arguments are omitted.
  5. **Standard Streams & Piping**:
     - Respect non-interactive execution (`process.stdout.isTTY`): Automatically disable colors and spinners when piped to files or another command.
     - Support `--json` flag to emit parseable JSON for scripting.
  6. **Exit Codes**: Explicit POSIX exit codes (0 for success, 1 for runtime failure, 2 for invalid arguments/syntax).

---

## 2. Implementation Patterns

### Node.js / TypeScript (Commander + Picocolors + Ora)
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';

const program = new Command();

program
  .name('craft')
  .description('Industrial-grade developer scaffolding CLI')
  .version('1.0.0');

program
  .command('create <name>')
  .description('Scaffold a new project workspace')
  .option('-t, --template <type>', 'Template type: web | api | fullstack', 'web')
  .option('--dry-run', 'Simulate creation without writing to disk')
  .action(async (name, options) => {
    console.log(pc.bold(pc.cyan(`\n⚡ THIRD_EYE Craft CLI v1.0.0`)));
    console.log(pc.dim(`Creating project ${pc.white(name)} [${options.template}]...\n`));

    const spinner = ora('Initializing workspace structure...').start();
    try {
      // Execute logic
      await new Promise((r) => setTimeout(r, 600));
      spinner.succeed(pc.green(`Successfully scaffolded ${name}!`));
      console.log(pc.bold('\nNext steps:'));
      console.log(`  cd ${name}`);
      console.log(`  npm run dev\n`);
    } catch (err: any) {
      spinner.fail(pc.red(`Failed to scaffold: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
```

---

## 3. Production Verification Checklist
1. Make file executable: Set shebang `#!/usr/bin/env node` and `chmod +x`.
2. Configure `package.json`: Include `"bin": { "tool-name": "./bin/index.js" }`.
3. Test `--help` and `--version` flags.
4. Verify graceful handling of `SIGINT` (Ctrl+C).
