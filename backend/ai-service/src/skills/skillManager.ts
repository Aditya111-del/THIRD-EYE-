import fs from 'fs';
import path from 'path';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  tools?: string[];
  instructions: string;
  filePath: string;
}

export class SkillManager {
  private skills: Map<string, SkillDefinition> = new Map();
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadSkills();
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadSkills();
  }

  /**
   * Discovers and parses all SKILL.md / skill.md files across workspace
   */
  public loadSkills(): SkillDefinition[] {
    this.skills.clear();
    const candidateDirs = [
      path.join(this.workspaceRoot, 'skills'),
      path.join(this.workspaceRoot, '.third-eye', 'skills'),
      path.resolve(__dirname, '../../../../skills'),
    ];

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = path.join(dir, entry.name);
            const possibleFiles = ['SKILL.md', 'skill.md', 'Skill.md'];
            for (const f of possibleFiles) {
              const fullPath = path.join(skillDir, f);
              if (fs.existsSync(fullPath)) {
                this.parseAndRegisterSkill(fullPath, entry.name);
                break;
              }
            }
          } else if (entry.isFile() && (entry.name.endsWith('.skill.md') || entry.name.endsWith('-skill.md'))) {
            this.parseAndRegisterSkill(path.join(dir, entry.name), entry.name.replace(/\.md$/, ''));
          }
        }
      } catch (err) {
        console.warn('[SkillManager] Error reading skill directory:', dir, err);
      }
    }

    return Array.from(this.skills.values());
  }

  private parseAndRegisterSkill(filePath: string, fallbackId: string) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      let name = fallbackId;
      let description = '';
      let tools: string[] = [];
      let instructions = raw;

      // Extract YAML frontmatter
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (match && match[1]) {
        const frontmatter = match[1];
        instructions = (match[2] || '').trim();

        const nameMatch = frontmatter.match(/name:\s*([^\r\n]+)/i);
        if (nameMatch && nameMatch[1]) name = nameMatch[1].trim();

        const descMatch = frontmatter.match(/description:\s*([^\r\n]+)/i);
        if (descMatch && descMatch[1]) description = descMatch[1].trim();

        const toolsMatch = frontmatter.match(/tools:\s*\[(.*?)\]/i);
        if (toolsMatch && toolsMatch[1]) {
          tools = toolsMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        }
      }

      const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      this.skills.set(id, {
        id,
        name,
        description,
        tools,
        instructions,
        filePath,
      });
    } catch (err) {
      console.warn('[SkillManager] Failed to parse skill file:', filePath, err);
    }
  }

  public getSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  public getSkill(idOrName: string): SkillDefinition | undefined {
    const key = idOrName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return this.skills.get(key) || Array.from(this.skills.values()).find((s) => s.name.toLowerCase() === idOrName.toLowerCase());
  }

  /**
   * Matches relevant skills based on user prompt or task keywords
   */
  public matchSkills(query: string, maxResults: number = 3): SkillDefinition[] {
    if (!query) return [];
    const q = query.toLowerCase();

    const domainKeywordMap: Record<string, string[]> = {
      'frontend-design': [
        'frontend-design', 'design', 'visual design', 'typography', 'palette', 'aesthetic',
        'aesthetics', 'layout', 'distinctive', 'anti-template', 'hero', 'brand identity',
        'ui design', 'styling', 'color palette', 'creative', 'studio', 'microcopy',
        'copywriting', 'look and feel', 'visual identity', 'typeface'
      ],
      'web-app-architecture': [
        'website', 'web', 'site', 'frontend', 'html', 'css', 'tailwind', 'react', 'vite',
        'page', 'ui', 'components', 'milkshake', 'store', 'landing', 'portfolio',
        'responsive', 'navbar', 'ecommerce', 'e-commerce', 'shop'
      ],
      'fullstack-saas-development': [
        'saas', 'fullstack', 'full-stack', 'dashboard', 'billing', 'subscription', 'tenant',
        'kpi', 'admin', 'metrics', 'analytics dashboard'
      ],
      'api-backend-engineering': [
        'api', 'backend', 'server', 'express', 'fastify', 'rest', 'endpoint', 'endpoints',
        'route', 'routes', 'controller', 'middleware', 'http'
      ],
      'database-and-orm': [
        'database', 'db', 'sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'prisma',
        'drizzle', 'orm', 'migration', 'migrations', 'schema', 'seed', 'table', 'foreign key'
      ],
      'electron-desktop-apps': [
        'electron', 'desktop', 'native app', 'window', 'tauri', 'ipc', 'desktop app'
      ],
      'mobile-app-development': [
        'mobile', 'react native', 'expo', 'flutter', 'ios', 'android', 'tablet', 'phone app'
      ],
      'ai-agentic-and-rag-systems': [
        'ai', 'agent', 'rag', 'llm', 'embeddings', 'vector', 'langchain', 'llamaindex',
        'prompt', 'openai', 'gemini', 'anthropic', 'retrieval'
      ],
      'system-programming-rust-go': [
        'rust', 'cargo', 'go', 'golang', 'systems', 'concurrency', 'tokio', 'goroutine'
      ],
      'game-dev-and-3d-graphics': [
        'game', '3d', 'three.js', 'threejs', 'webgl', 'canvas', 'graphics', 'shader',
        'physics', 'animation', 'r3f', 'react three fiber'
      ],
      'realtime-websockets-webrtc': [
        'websocket', 'websockets', 'socket.io', 'socket', 'webrtc', 'realtime', 'real-time',
        'live', 'sse', 'chat', 'peer to peer', 'streaming'
      ],
      'microservices-and-event-driven': [
        'microservice', 'microservices', 'kafka', 'rabbitmq', 'redis streams', 'cqrs',
        'event-driven', 'outbox', 'message broker'
      ],
      'performance-optimization-profiling': [
        'perf', 'performance', 'optimize', 'profiling', 'lcp', 'inp', 'cls', 'web vitals',
        'speed up', 'slow', 'memory leak', 'bundle size'
      ],
      'web3-smart-contracts': [
        'web3', 'smart contract', 'solidity', 'ethereum', 'crypto', 'erc20', 'erc721',
        'token', 'viem', 'wagmi', 'foundry', 'hardhat'
      ],
      'cli-tools-and-developer-utilities': [
        'cli', 'command line', 'terminal tool', 'command-line', 'developer tool', 'utility',
        'commander', 'argv'
      ],
      'data-engineering-and-analytics': [
        'data engineering', 'analytics', 'duckdb', 'polars', 'pandas', 'parquet', 'etl',
        'elt', 'pipeline', 'dataset', 'arrow'
      ],
      'cloud-devops-deployment': [
        'docker', 'docker-compose', 'devops', 'deploy', 'deployment', 'ci/cd', 'kubernetes',
        'nginx', 'container', 'github actions'
      ],
      'security-and-auth': [
        'auth', 'authentication', 'authorization', 'jwt', 'bcrypt', 'security', 'login',
        'password', 'oauth', 'session', 'rbac', 'owasp'
      ],
      'state-management-and-data-flow': [
        'state management', 'zustand', 'redux', 'react query', 'tanstack query', 'store',
        'cache', 'data flow'
      ],
      'enterprise-project-scaffolding': [
        'scaffold', 'scaffolding', 'architecture', 'enterprise', 'monorepo',
        'clean architecture', 'project structure', 'new project', 'create project'
      ],
      'python-development': [
        'python', 'py', 'fastapi', 'flask', 'poetry', 'pip', 'virtualenv', 'pytest'
      ],
      'debugging-diagnostics': [
        'debug', 'debugging', 'fix', 'error', 'bug', 'issue', 'crash', 'trace',
        'exception', 'failed', 'stack trace'
      ],
      'e2e-testing': [
        'test', 'testing', 'tests', 'unit test', 'e2e', 'vitest', 'jest', 'playwright',
        'cypress', 'assertion', 'specs'
      ],
      'code-refactoring': [
        'refactor', 'refactoring', 'clean code', 'rewrite', 'simplify', 'technical debt',
        'code smell'
      ],
    };

    const scoredSkills: Array<{ skill: SkillDefinition; score: number }> = [];

    for (const skill of this.skills.values()) {
      let score = 0;
      const skillName = skill.name.toLowerCase();
      const skillId = skill.id.toLowerCase();

      // Direct name match
      if (q.includes(skillId) || q.includes(skillName)) {
        score += 15;
      }

      // Check mapped keywords
      const keywords = domainKeywordMap[skill.id] || domainKeywordMap[skillName] || [];
      for (const kw of keywords) {
        if (q.includes(kw)) {
          score += kw.length > 5 ? 5 : 3;
        }
      }

      if (score > 0) {
        scoredSkills.push({ skill, score });
      }
    }

    scoredSkills.sort((a, b) => b.score - a.score);
    return scoredSkills.slice(0, maxResults).map((s) => s.skill);
  }

  /**
   * Formats active skills into system prompt context
   */
  public formatSkillsPrompt(activeSkills?: SkillDefinition[]): string {
    const all = this.getSkills();
    if (all.length === 0) return '';

    let prompt = `\nAVAILABLE SKILLS (${all.length} registered in workspace):\n`;
    for (const s of all) {
      prompt += `- [${s.name}]: ${s.description}\n`;
    }

    if (activeSkills && activeSkills.length > 0) {
      prompt += `\nACTIVE SKILL INSTRUCTIONS FOR THIS SESSION:\n`;
      for (const s of activeSkills) {
        prompt += `--- SKILL: ${s.name} ---\n${s.instructions}\n`;
      }
    }

    return prompt;
  }
}
