"use strict";
/**
 * Agent Execution Permission Decision Contracts and Auto-Allow Policies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AUTO_ALLOW_COMMANDS = void 0;
exports.isCommandAutoAllowed = isCommandAutoAllowed;
exports.DEFAULT_AUTO_ALLOW_COMMANDS = [
    'git status',
    'git branch',
    'git log',
    'git diff',
    'ls',
    'pwd',
    'dir',
    'echo',
    'cat',
    'node -v',
    'npm -v',
    'bun -v',
    'python --version',
    'python3 --version',
];
function isCommandAutoAllowed(command, customAllowedList = []) {
    if (!command || typeof command !== 'string')
        return false;
    const trimmed = command.trim().toLowerCase();
    // Check exact matches or prefixes in default list
    for (const cmd of exports.DEFAULT_AUTO_ALLOW_COMMANDS) {
        if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
            return true;
        }
    }
    // Check custom allowed list
    for (const cmd of customAllowedList) {
        const customTrimmed = cmd.trim().toLowerCase();
        if (trimmed === customTrimmed || trimmed.startsWith(customTrimmed + ' ')) {
            return true;
        }
    }
    return false;
}
