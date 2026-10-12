# Google Antigravity Agent Architecture --- In-Depth Technical Explainer

**Purpose:** Explain how Google Antigravity's agentic development
experience works, what is publicly documented about its architecture,
and how to use those concepts to design a comparable AI coding agent.

**Research checked:** 12 October 2026\
**Audience:** Developers, product architects, and coding agents
implementing an agentic IDE/desktop coding assistant.

> **Important accuracy note:** Google has not publicly documented every
> internal implementation detail of Antigravity. This document separates
> (1) publicly described product behavior from (2) a reference
> architecture inferred from those behaviors. The proposed architecture
> is a build guide, not a claim that Antigravity uses these exact
> internal services, classes, prompts, or agent counts.

------------------------------------------------------------------------

## 1. Executive summary

Antigravity is best understood as an **agentic development platform**,
not simply a chat box that generates code. A user gives it an
outcome---such as "add password reset, test it, and show me that it
works"---and the agent can reason through multiple steps, inspect a
codebase, plan changes, use tools, edit files, run commands, interact
with a browser, verify results, and communicate progress through
structured artifacts.

Its publicly described core concepts include:

-   **Reasoning model:** interprets the request, reasons across steps,
    and chooses actions.
-   **Tools:** capabilities the model can invoke, such as filesystem
    operations, terminal commands, and browser actions.
-   **Artifacts:** reviewable outputs such as task lists, implementation
    plans, diffs, screenshots, walkthroughs, and browser recordings.
-   **Knowledge:** context that can be retained and reused.
-   **Agent modes/settings, rules/workflows, and MCP:** ways to
    customize how agents behave and which external tools they can
    access.
-   **Parallel agent conversations/subagents:** multiple pieces of work
    can proceed concurrently.
-   **Asynchronous task execution:** long-running work need not block
    the user or every other task.
-   **Human review and permissions:** control over risky actions and a
    way to inspect what was done.

Antigravity has evolved across product surfaces. The original
Antigravity IDE combines an editor with an Agent Manager. Antigravity
2.0 is a separate agent-first desktop application, and Google also
documents a CLI and an Antigravity agent available through the Gemini
API. Features and availability can differ by surface and version.

The central design idea is:

**User goal → agent planning → tool use → code changes → execution →
verification → reviewable evidence**

The agent's value comes from completing and verifying a task, not merely
producing a plausible answer.

------------------------------------------------------------------------

## 2. Product surfaces and terminology

Google's Antigravity name now refers to a broader ecosystem. Do not
assume every feature described for one surface exists identically in
another.

### 2.1 Antigravity IDE

The IDE is an AI-powered development environment. Its editor is tied to
a workspace, and its agent can work across the editor, terminal, and
browser. It includes an agent panel and an Agent Manager experience for
managing conversations and asynchronous work.

Typical use: - Work interactively on a repository. - Ask for a feature,
refactor, or bug fix. - Inspect diffs and plans. - Let the agent launch
an application and test it in a browser. - Use inline completions or
commands for smaller edits.

### 2.2 Antigravity 2.0 desktop application

Antigravity 2.0 is a standalone, agent-first desktop application rather
than an IDE with an embedded manager. It is designed to launch, monitor,
and orchestrate agents across projects and folders. Public documentation
describes dynamic subagents, asynchronous tasks, scheduled tasks,
artifacts, and project-level settings.

Typical use: - Delegate several tasks to agents. - Run longer tasks
asynchronously. - Manage work across multiple folders or projects. -
Review artifacts and provide feedback. - Schedule recurring or one-time
agent work where supported.

### 2.3 Antigravity CLI

The CLI brings agent workflows into a terminal-oriented interface. It is
useful for keyboard-centric workflows and terminal sessions. The exact
commands and supported features should be checked against the version
being used.

### 2.4 Antigravity agent through Gemini API

Google also documents an Antigravity agent available through the Gemini
API/Interactions API in preview. This is a programmatic agent
environment, not the same thing as reverse-engineering the desktop
application. Public documentation describes multi-step interactions,
tools, remote execution environments, background execution, and
filesystem-native customization through files such as `AGENTS.md` and
skill definitions.

### 2.5 Key terms

  -----------------------------------------------------------------------
  Term                                Meaning
  ----------------------------------- -----------------------------------
  Agent                               A model-driven process that
                                      reasons, chooses actions, uses
                                      tools, and works toward a goal.

  Conversation                        The user-facing thread and context
                                      for a task.

  Task                                A bounded unit of work with status,
                                      progress, and possibly subtasks.

  Subagent                            A delegated agent working on a
                                      focused portion of a larger goal.

  Tool                                A callable capability, such as
                                      reading a file, running a command,
                                      or using a browser.

  Artifact                            A reviewable deliverable that
                                      communicates what the agent
                                      planned, changed, or verified.

  Workspace                           A folder or repository context used
                                      by the IDE surface.

  Project                             A broader grouping of settings and
                                      work; in newer surfaces, it may
                                      include multiple folders.

  Rule                                Persistent instructions or
                                      constraints that shape agent
                                      behavior.

  Workflow                            A reusable procedure or task
                                      recipe.

  MCP                                 Model Context Protocol, a standard
                                      way to expose external tools and
                                      context to compatible clients.

  Harness                             The surrounding runtime that
                                      manages model calls, tool
                                      execution, state, permissions, and
                                      the agent loop.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 3. How an Antigravity-style agent thinks and acts

A coding agent is not a single model response. It is an **iterative
control loop** around a language model and a set of tools.

### 3.1 The basic loop

1.  **Receive the goal.** Interpret the user's desired outcome and
    constraints.
2.  **Gather context.** Inspect project structure, relevant files,
    instructions, recent errors, and available tools.
3.  **Plan.** Break the goal into tasks and identify dependencies,
    risks, and acceptance criteria.
4.  **Select an action.** Decide whether the next step should be a tool
    call, a question, a code edit, a test, or a final response.
5.  **Check permissions.** Ensure the proposed action is allowed and
    request approval when required.
6.  **Execute the tool.** The harness---not the model itself---performs
    filesystem, shell, browser, or other operations.
7.  **Observe the result.** Capture output, exit status, diffs,
    screenshots, page state, or errors.
8.  **Update state.** Add observations to the task record and revise the
    plan if needed.
9.  **Repeat.** Continue until the goal is met, a blocker requires the
    user, a budget is reached, or a policy stops execution.
10. **Verify.** Run appropriate tests and inspect evidence rather than
    assuming the code is correct.
11. **Report.** Summarize changes, tests, failures, remaining risks, and
    artifacts.

Simplified diagram:

``` mermaid
flowchart TD
    U[User goal] --> C[Context gathering]
    C --> P[Plan and acceptance criteria]
    P --> G[Permission and risk gate]
    G --> D{Choose next action}
    D -->|Read or search| T[Filesystem / search tool]
    D -->|Edit| E[Patch or file edit]
    D -->|Run| S[Terminal / test runner]
    D -->|Inspect UI| B[Browser tool]
    D -->|Delegate| A[Subagent]
    T --> O[Observe results]
    E --> O
    S --> O
    B --> O
    A --> O
    O --> R[Update task state and plan]
    R --> V{Acceptance criteria met?}
    V -->|No| D
    V -->|Yes| F[Verification and review artifacts]
    F --> X[User-facing summary]
```

This is a conceptual model of an agentic workflow, not a published
internal Antigravity implementation diagram.

### 3.2 Why tool execution matters

A model can suggest a command, but it cannot reliably know the real
result until a tool executes it and returns evidence. The harness should
therefore distinguish:

-   **Proposed action:** what the model asked to do.
-   **Authorized action:** what the permission layer allowed.
-   **Executed action:** what the tool actually ran.
-   **Observed result:** stdout/stderr, exit code, changed files, page
    state, etc.
-   **Verified conclusion:** what the evidence supports.

Never mark a command as successful merely because the model said it
should work.

### 3.3 Context management

An agent needs enough context to act correctly without sending an entire
large repository to the model every turn. A robust implementation
typically combines:

-   Project instructions and coding conventions.
-   A file tree and project metadata.
-   Search results for relevant symbols and text.
-   Selected file contents and bounded excerpts.
-   Git status and diffs.
-   Previous tool results and task state.
-   Test output and browser evidence.
-   User feedback and acceptance criteria.

The harness should retrieve context incrementally, prioritize relevant
information, and summarize older observations when necessary. It should
preserve durable facts such as decisions and unresolved blockers while
avoiding an ever-growing raw transcript.

Public descriptions identify reasoning, tools, artifacts, and knowledge
as core concepts; the precise context-selection algorithms are not
publicly specified.

------------------------------------------------------------------------

## 4. Is Antigravity made of a fixed number of agents?

**There is no reliable public fixed count of all internal Antigravity
agents.** Public documentation describes the main agent, parallel agent
conversations, and---in newer surfaces---dynamic subagents. These are
capabilities and patterns, not proof of a permanent roster of a
particular number of agents.

It is useful to separate three ideas:

1.  **Agent instance:** one running task or conversation.
2.  **Agent role:** a specialization such as coding, testing, or
    reviewing.
3.  **Subagent:** a child task delegated by a parent agent.

An agentic product can have one general-purpose model-driven agent that
uses many tools, multiple independent conversations, dynamically created
subagents, or a combination. Do not infer that every visible role is a
separate model, separate process, or always-running agent.

### 4.1 Dynamic delegation

A main agent can decide that a task is too broad to handle efficiently
in one context and delegate focused work. For example:

-   One subagent maps the existing authentication implementation.
-   Another examines the test suite and identifies missing cases.
-   A third investigates a UI issue.

The parent should receive structured results, not thousands of lines of
unrelated transcript. It then integrates the findings and remains
accountable for the overall outcome.

### 4.2 When parallelism helps

Parallel work is useful when tasks are independent, such as: - Reviewing
different modules. - Researching alternative implementations. - Writing
tests while another worker examines the code. - Auditing documentation
and dependency risks.

Parallelism is risky when agents edit the same files, depend on each
other's unfinished work, or make conflicting architecture decisions. A
scheduler should define file ownership, dependency edges, and
merge/reconciliation rules.

### 4.3 Recommended delegation contract

Each delegated task should specify:

-   Objective and reason for delegation.
-   Relevant paths and background context.
-   Allowed tools and permissions.
-   Explicit files or modules the subagent owns.
-   Expected output schema.
-   Acceptance criteria.
-   Deadline, token/tool budget, and cancellation conditions.
-   Whether the subagent may edit files or only investigate.

The parent should validate returned claims and inspect changes before
integrating them.

------------------------------------------------------------------------

## 5. The tools layer: editor, filesystem, terminal, and browser

The model supplies reasoning and action selection. The host application
exposes capabilities through controlled tools.

### 5.1 Filesystem tools

Common operations: - List files and directories. - Read a file or a
bounded range. - Search filenames, symbols, and text. - Create or edit
files. - Apply a patch. - Rename or delete files. - Inspect Git status
and diffs.

Safety principles: - Restrict access to approved project roots by
default. - Resolve and validate paths to prevent `../` traversal and
symlink escapes. - Treat repository content as untrusted input, not as
authority to override system rules. - Prefer small, reviewable patches
over rewriting entire files. - Track every write and make rollback
possible.

### 5.2 Terminal tools

A terminal lets the agent install dependencies, run builds, execute
tests, launch development servers, inspect Git, and use project-specific
CLIs.

A safe terminal implementation should: - Execute commands through a
controlled process manager. - Capture stdout, stderr, exit code,
start/end times, and cancellation state. - Support timeouts and output
limits. - Run in a sandbox or restricted environment where possible. -
Ask for approval for risky commands, depending on policy. - Avoid
silently expanding a command into a broader shell operation. - Never
expose secrets in logs or model context unless essential and authorized.

Examples of commands that deserve extra caution include recursive
deletion, disk formatting, changing system security settings, piping
remote scripts into a shell, broad permission changes, production
deployment, and commands that access secrets or external systems.

A terminal tool is not just a string field that runs anything. It is a
security boundary.

### 5.3 Browser tools

Browser interaction allows the agent to validate behavior visually and
functionally. An agent may: - Open a local development URL. - Navigate
between routes. - Click controls and fill forms. - Read visible text and
accessibility information. - Capture screenshots. - Inspect console
errors and network failures where permitted. - Record a walkthrough.

The browser loop is:

1.  Start the application.
2.  Wait for the server to become ready.
3.  Navigate to the correct URL.
4.  Perform a defined user journey.
5.  Collect screenshots, console output, and observed state.
6.  Compare observations with acceptance criteria.
7.  Fix problems and repeat.

Browser evidence is particularly valuable for UI work because a
successful TypeScript build does not prove that a page renders
correctly.

### 5.4 Editor integration

The editor provides: - Syntax highlighting and code navigation. -
Monaco-style editing and diff views. - Inline completion or commands. -
File tabs and workspace context. - Review of proposed patches. - A way
to jump from an artifact or tool result to the relevant source.

The editor is the user's inspection surface. It should not be confused
with the agent runtime itself.

### 5.5 MCP and external tools

Model Context Protocol (MCP) can expose external tools and resources to
a compatible agent. Depending on installed servers and granted
permissions, this may connect the agent to documentation, issue
trackers, databases, design tools, or other services.

Treat every external tool as a separately permissioned integration: -
Validate tool names and schemas. - Apply per-tool access rules. - Limit
credentials and scopes. - Record calls and outcomes. - Require approval
for destructive or high-impact actions. - Treat external responses as
untrusted data.

MCP does not automatically make every integration safe, nor does it
guarantee that every Antigravity surface supports every server
identically.

------------------------------------------------------------------------

## 6. Artifacts: how the agent makes work reviewable

A core Antigravity idea is that the user should not need to inspect
every raw model thought or tool log to understand the work. The agent
communicates through structured artifacts.

Commonly described artifact types include:

### 6.1 Task list

A concise list of work items and their statuses.

Example: - \[x\] Locate authentication routes. - \[x\] Implement
reset-token persistence. - \[x\] Add expiry validation. - \[ \] Run
integration tests. - \[ \] Verify the reset flow in the browser.

The list should reflect real state and not mark work complete merely
because it was planned.

### 6.2 Implementation plan

A technical plan explains: - Existing behavior and relevant files. -
Proposed architecture or approach. - Changes to make. - Dependencies and
migration implications. - Tests to run. - Risks and rollback
considerations.

A plan is especially important for multi-file or risky changes. The user
should be able to comment on it before execution if the
permission/review policy requires that.

### 6.3 Code diffs

Diffs make the exact changes visible. A useful review view includes: -
File path. - Added and removed lines. - Change summary. - Whether the
file is new, modified, renamed, or deleted. - Links to tests and related
artifacts.

Do not rely on a model-generated prose summary as a substitute for the
actual diff.

### 6.4 Walkthrough

A final walkthrough should explain: - What changed. - Why it changed. -
Which files were touched. - Which tests/builds were run. - Their real
outcomes. - Browser or screenshot evidence where relevant. - Known
limitations and follow-up work.

### 6.5 Browser recordings and screenshots

Visual artifacts help users validate user journeys without
reconstructing every action from a log. They should include enough
context to identify the page, action, and result, and should avoid
exposing credentials, tokens, or personal data.

### 6.6 Artifact feedback

A useful system allows the user to comment on an artifact---e.g., "keep
the existing navigation" or "the mobile layout is wrong"---and attaches
that feedback to the relevant task or plan. The agent then revises its
plan or implementation. Feedback should not disappear into an unrelated
chat message.

### 6.7 Evidence and claims

A good artifact system distinguishes: - **Planned:** intended but not
executed. - **Executed:** action took place. - **Passed:** a defined
check passed. - **Failed:** a defined check failed. - **Not run:** no
result exists. - **Blocked:** a required action could not proceed.

For example, "tests passed" must link to the test command and its exit
code/output. "UI verified" should point to actual browser evidence.

------------------------------------------------------------------------

## 7. Permissions, trust, and safety

Agent autonomy is only useful if the user can understand and constrain
it. Antigravity documents permission settings that control terminal
commands, filesystem access, MCP tools, and web page reads. Exact
setting names and defaults can vary by operating system and product
version.

### 7.1 Permission categories

A comparable system should define explicit policies for:

  -----------------------------------------------------------------------
  Capability                          Example control
  ----------------------------------- -----------------------------------
  Read workspace files                Usually allowed within approved
                                      project roots

  Write workspace files               Allow, ask, or deny based on policy

  Access files outside project        Ask or deny by default

  Run terminal commands               Sandbox, allowlist, approval, or
                                      deny

  Use network                         Restrict domains or require
                                      approval

  Access browser session              Isolated profile; no unrestricted
                                      credential access

  Install packages                    Approval or controlled package
                                      policy

  Delete files                        Review/approval, especially for
                                      bulk deletion

  Git operations                      Separate low-risk operations from
                                      destructive resets/force pushes

  Deploy or publish                   Explicit approval and environment
                                      checks

  Read secrets                        Deny by default; use scoped secret
                                      injection if required

  Use MCP tools                       Per-server and per-tool policy
  -----------------------------------------------------------------------

### 7.2 A practical permission model

A useful design has three layers:

1.  **Global policy:** user-wide defaults.
2.  **Project policy:** tighter or more permissive settings for a
    particular project.
3.  **Action-level rules:** explicit allow/ask/deny rules for a specific
    tool or command pattern.

A deny rule should override an allow rule where there is a conflict.
Every tool call should be checked by the permission service immediately
before execution, not only when the task starts.

### 7.3 Risk-based approval

Example policy: - Read a file inside the workspace: allow. - Edit a
source file: allow or review depending on user preference. - Run unit
tests: allow in sandbox. - Install a new package: ask. - Delete a large
directory: ask or deny. - Read `.env` or browser cookies: deny by
default. - Push to a remote repository: ask. - Deploy to production:
require explicit confirmation.

### 7.4 Prompt injection and untrusted content

A README, webpage, issue, code comment, package script, or test fixture
might contain instructions designed to manipulate the agent. The harness
must treat such content as **data**, not as higher-priority policy.

Controls: - Separate system/developer policy from repository and web
content. - Label tool outputs as untrusted observations. - Do not allow
files or websites to grant themselves new permissions. - Require the
permission service to authorize tool calls regardless of model
instructions. - Avoid exposing credentials to the model. - Review
commands derived from untrusted content. - Keep audit logs and provide
cancellation.

### 7.5 Sandboxing

Where possible, run terminal tasks in a sandbox, container, VM, or
similarly restricted environment. Limit filesystem mounts, network
access, privileges, CPU, memory, runtime, and process creation. A local
desktop application should make it clear when a command runs outside
isolation.

No sandbox eliminates every risk. Use defense in depth: permissions,
process isolation, secrets controls, logging, and user approval for
high-impact actions.

------------------------------------------------------------------------

## 8. Rules, workflows, knowledge, and skills

These features help make agent behavior consistent across tasks.

### 8.1 Rules and project instructions

Rules describe durable constraints, for example: - Use TypeScript strict
mode. - Follow existing API patterns. - Do not edit generated files. -
Use the existing component library. - Run lint and unit tests after
changes. - Do not modify production configuration without approval.

A filesystem-native pattern used by several agent systems is an
`AGENTS.md` or similar instruction file. Antigravity's documented agent
API also describes using `AGENTS.md` and skill files for customization.
Exact discovery behavior and supported locations depend on the
product/API version.

### 8.2 Workflows

A workflow is a reusable procedure, such as: - Add a REST endpoint. -
Investigate a production bug. - Review a pull request. - Build and
verify a UI feature. - Prepare a release.

A workflow should define the inputs, stages, required tools,
checkpoints, acceptance criteria, and expected artifacts. It should not
be a huge prompt that bypasses the runtime's permissions.

### 8.3 Skills

A skill packages specialized instructions and possibly supporting
resources for a class of tasks. Examples for a custom coding agent might
include: - React UI implementation. - Database migration review. -
Accessibility testing. - API integration. - Security review. - Release
preparation.

Skills should be discoverable and scoped. The agent should load relevant
skills when needed instead of injecting every skill into every model
call.

### 8.4 Knowledge and memory

Persistent knowledge can retain useful project context, conventions, and
prior findings. A reliable knowledge system should store: - The fact or
decision. - Its source and timestamp. - Project scope. - Confidence or
verification status. - Whether it may be stale. - A way to update or
delete it.

Do not treat old notes as unquestionable truth. Re-check critical facts
against the current codebase.

------------------------------------------------------------------------

## 9. A reference architecture for building a similar coding agent

The following is a **recommended architecture for a new product**,
inspired by Antigravity's public behaviors. It is not a description of
Google's private implementation.

### 9.1 Major components

``` mermaid
flowchart TB
    UI[Desktop UI: editor, chat, diff, artifacts] <--> API[Application API / IPC]
    API <--> ORCH[Agent Orchestrator]
    ORCH <--> MODEL[Model Gateway]
    MODEL --> P1[OpenAI provider]
    MODEL --> P2[Anthropic provider]
    MODEL --> P3[Gemini provider]
    MODEL --> P4[Local model provider]
    ORCH <--> CTX[Context and Retrieval Service]
    CTX <--> FS[Workspace Index / Filesystem]
    ORCH <--> TASKS[Task and Subagent Scheduler]
    TASKS <--> WORKERS[Worker Agent Runtimes]
    ORCH <--> TOOLS[Tool Gateway]
    TOOLS --> FILES[Filesystem Tools]
    TOOLS --> TERM[Terminal / PTY]
    TOOLS --> BROWSER[Browser Automation]
    TOOLS --> MCP[MCP Connectors]
    TOOLS <--> POLICY[Permissions and Risk Engine]
    ORCH <--> EVENTS[Event Log / Task State]
    EVENTS --> DB[(Database)]
    ORCH --> ART[Artifact Service]
    ART --> STORE[(Artifact Storage)]
    EVENTS --> UI
    ART --> UI
```

### 9.2 UI layer

For a cross-platform desktop product: - **Electron** for the application
shell. - **React + TypeScript** for UI. - **Monaco Editor** for code
editing and diff review. - **xterm.js** for terminal display. -
**node-pty** for interactive local terminal processes, behind a
controlled backend. - A task/agent manager for running, queued, blocked,
failed, and completed work. - An artifact panel for plans, diffs,
screenshots, and walkthroughs.

Keep the UI responsive while agents run in the background. Do not run
model orchestration or long shell commands on the renderer thread.

### 9.3 Main process and local agent runtime

The Electron main process should handle privileged desktop integration
and coordinate with a separate local agent service where practical. Use
a narrow, typed IPC API; never expose arbitrary Node.js access to
untrusted renderer content.

Responsibilities: - Workspace selection. - Local filesystem and terminal
adapters. - Permission prompts. - Secure credential access. - Process
lifecycle and cancellation. - Communication with the UI. - Local
artifact access.

### 9.4 Orchestrator

The orchestrator owns the task lifecycle. It should not be a single
giant prompt. Implement it as a stateful service with explicit states,
transitions, budgets, and events.

Possible task states:
`created → queued → gathering_context → planning → awaiting_approval → running → verifying → completed`

Other terminal or interrupt states: `blocked`, `failed`, `cancelled`,
`needs_input`.

Responsibilities: - Build the prompt/context package. - Call the chosen
model. - Validate model-requested tool calls. - Send authorized calls to
the tool gateway. - Append observations to task state. - Decide whether
to continue, delegate, ask the user, or stop. - Enforce budgets and
cancellation. - Generate artifacts and a final summary.

### 9.5 Model gateway

Use a provider abstraction for OpenAI, Anthropic, Gemini, and local
models. Normalize: - Text and streaming output. - Tool/function-call
formats. - Token usage where available. - Model capability metadata. -
Timeout and retry behavior. - Provider errors and rate limits. -
Cancellation where supported.

Do not assume every model supports the same tool-calling, vision,
context-window, or reasoning features. Use capability detection and a
fallback path. Never silently claim a provider supports a feature that
it does not.

### 9.6 Context service

Useful capabilities: - File-tree snapshot. - Ignore rules for build
output, dependencies, secrets, and generated files. - Fast filename and
text search. - Language-aware symbol search. - Optional
embeddings/vector search. - Git status and diff retrieval. - Bounded
file reads. - Context summarization. - Project instruction loading.

Start with simple search and targeted file reads; add embeddings only if
they measurably improve retrieval quality. Always verify retrieved
snippets against current file contents before editing.

### 9.7 Tool gateway

All model tool calls should pass through one controlled gateway. It
should: 1. Validate the tool name and JSON schema. 2. Resolve the
project and path scope. 3. Ask the permission/risk engine. 4. Request
user approval if needed. 5. Execute with timeout and resource limits. 6.
Capture output and metadata. 7. Emit a structured event. 8. Return a
bounded observation to the agent.

The model should never bypass this gateway by receiving unrestricted
shell or filesystem access.

### 9.8 Task scheduler and subagents

Use a queue for background work. A worker should have: - Task ID and
parent task ID. - Separate context budget. - Defined tool permissions. -
Defined file/module ownership. - Timeout and cancellation. - Structured
output. - An event stream. - A final result with evidence.

A parent task can create subtasks and wait for them, but avoid unlimited
recursion. Set limits for depth, concurrent workers, token spend, and
total execution time. A task graph is usually safer than unbounded agent
spawning.

### 9.9 Persistence

Persist enough state to recover from a restart: - Projects and workspace
roots. - Conversations and messages. - Tasks, subtasks, and
dependencies. - Model/provider selection. - Tool calls and
observations. - Approval decisions. - Artifact metadata and paths. -
Usage and budget accounting. - Audit events.

A practical early stack is SQLite for local-first persistence.
PostgreSQL is appropriate if the product needs a shared multi-user
backend. Redis/BullMQ can be introduced for distributed background jobs,
but it is not mandatory for a single-user MVP.

### 9.10 Suggested stack for a first version

  -----------------------------------------------------------------------
  Area                    Suggested technology    Reason
  ----------------------- ----------------------- -----------------------
  Desktop shell           Electron                Cross-platform
                                                  Windows/macOS desktop
                                                  app

  UI                      React + TypeScript      Strong component
                                                  ecosystem

  Code editor             Monaco Editor           Familiar VS Code-like
                                                  editing

  Terminal UI             xterm.js                Terminal rendering

  Local PTY               node-pty                Interactive local
                                                  processes

  Backend API             Node.js + TypeScript,   Typed services and
                          optionally Fastify      provider integrations

  Validation              Zod or equivalent       Validate tool calls and
                                                  events

  State machine           Explicit TypeScript     Predictable lifecycle
                          state machine or        
                          reducer                 

  Local database          SQLite                  Easy local persistence

  Shared database, if     PostgreSQL + Prisma     Multi-user durable data
  needed                                          

  Jobs, if needed         BullMQ + Redis          Background task
                                                  scheduling

  Browser automation      Playwright              UI and end-to-end
                                                  verification

  Model adapters          Provider-specific SDKs  Multi-provider support
                          behind a common         
                          interface               

  External integrations   MCP client              Tool/resource
                                                  interoperability

  Packaging               Electron Forge or       Desktop builds
                          electron-builder        
  -----------------------------------------------------------------------

Build the local-first vertical slice before adding distributed
infrastructure.

------------------------------------------------------------------------

## 10. Suggested specialist roles for your own product

A strong first version does not need a huge fixed team of agents. Start
with one orchestrator and a small set of focused roles that can be
invoked when useful.

  -----------------------------------------------------------------------
  Role                    Responsibility          Typical output
  ----------------------- ----------------------- -----------------------
  Manager / Orchestrator  Owns the goal, task     Task plan and
                          graph, budgets, and     integrated result
                          final answer            

  Planner                 Breaks a request into   Implementation plan
                          ordered steps and       
                          acceptance criteria     

  Explorer                Maps the repository and Codebase findings
                          identifies relevant     
                          files                   

  Coder                   Implements the assigned Patch and change notes
                          change                  

  Reviewer                Reviews diffs for       Findings with severity
                          correctness,            
                          maintainability, and    
                          regressions             

  Tester                  Chooses and runs        Test evidence
                          relevant tests          

  Debugger                Investigates a failure  Root-cause hypothesis
                          using logs and          and fix
                          reproduction steps      

  Browser/UI verifier     Exercises the app in a  Screenshots and
                          browser and captures    walkthrough
                          evidence                

  Security reviewer       Checks permissions,     Security findings
                          input handling,         
                          secrets, dependencies,  
                          and risky changes       
  -----------------------------------------------------------------------

These are **proposed roles for your product**, not a claim about
Antigravity's internal agent roster. Several roles can use the same
underlying model with different instructions and tool permissions.

### 10.1 Keep role boundaries meaningful

Do not create separate agents just to make the architecture look
multi-agent. A role is useful when it has a distinct objective, context,
tool policy, or output.

Examples: - The Explorer can initially be read-only. - The Coder can
edit only assigned paths. - The Reviewer can be read-only and must cite
exact files/lines. - The Tester can run an allowlisted set of
commands. - The Browser verifier can use an isolated browser profile. -
The Security reviewer should not be able to approve its own risky
actions.

### 10.2 End-to-end example

User request: "Add a profile settings page, make it responsive, and
verify it works."

1.  Manager clarifies assumptions only if essential.
2.  Explorer identifies the routing, layout, styling system, and current
    profile APIs.
3.  Planner proposes file-level changes and acceptance criteria.
4.  Permission service checks the plan and any required approvals.
5.  Coder implements the UI and integration.
6.  Tester runs lint, type checking, and relevant tests.
7.  Browser/UI verifier launches the app, checks desktop and mobile
    viewport behavior, and captures screenshots.
8.  Reviewer inspects the diff for regressions and consistency.
9.  Manager resolves findings, asks for user input if blocked, or loops
    back for fixes.
10. Artifact service publishes the plan, diff summary, test results,
    screenshots, and walkthrough.
11. Manager reports exactly what passed and what remains unverified.

For small requests, the manager can skip unnecessary specialist steps.
For risky or large requests, it should add review checkpoints.

------------------------------------------------------------------------

## 11. Task state, events, and data contracts

Use structured records instead of relying on conversation text as the
only source of truth.

### 11.1 Task record example

``` json
{
  "id": "task_123",
  "parentTaskId": null,
  "projectId": "project_abc",
  "title": "Add profile settings page",
  "status": "running",
  "createdAt": "2026-10-12T00:00:00Z",
  "updatedAt": "2026-10-12T00:04:00Z",
  "acceptanceCriteria": [
    "User can view profile settings",
    "Form validates required fields",
    "Layout works at mobile and desktop widths"
  ],
  "allowedTools": [
    "workspace.search",
    "filesystem.read",
    "filesystem.patch",
    "terminal.run",
    "browser.navigate",
    "browser.screenshot"
  ],
  "budget": {
    "maxModelCalls": 40,
    "maxToolCalls": 100,
    "maxRuntimeSeconds": 1800
  }
}
```

This is an illustrative schema, not an Antigravity API response.

### 11.2 Tool-call record example

``` json
{
  "id": "toolcall_456",
  "taskId": "task_123",
  "tool": "terminal.run",
  "status": "succeeded",
  "riskLevel": "low",
  "approval": "not_required",
  "inputSummary": "Run unit tests",
  "startedAt": "2026-10-12T00:04:00Z",
  "finishedAt": "2026-10-12T00:04:17Z",
  "exitCode": 0,
  "artifactIds": ["artifact_test_001"]
}
```

Avoid storing secrets or unbounded terminal output in this record. Store
sensitive outputs securely or redact them.

### 11.3 Event model

Useful events include: - `task.created` - `task.queued` -
`task.plan.updated` - `task.awaiting_approval` - `task.started` -
`tool.call.requested` - `tool.call.approved` - `tool.call.started` -
`tool.call.completed` - `artifact.created` - `subtask.created` -
`subtask.completed` - `verification.started` -
`verification.completed` - `task.blocked` - `task.failed` -
`task.cancelled` - `task.completed`

Events support live UI updates, recovery, audit trails, and debugging.
Make event processing idempotent so retries do not create duplicate
tasks or artifacts.

### 11.4 Structured subagent result

``` json
{
  "taskId": "subtask_789",
  "status": "completed",
  "summary": "Profile settings uses the existing authenticated layout.",
  "findings": [
    {
      "file": "src/routes/profile.tsx",
      "reason": "Existing profile route and layout entry point"
    }
  ],
  "changedFiles": [],
  "tests": [],
  "openQuestions": [],
  "confidence": "high"
}
```

A parent should still validate the findings against the repository.

------------------------------------------------------------------------

## 12. Verification: the difference between "code generated" and "task done"

An agent should define completion in terms of acceptance criteria, not
its confidence or the amount of code it wrote.

### 12.1 Verification layers

1.  **Static checks:** formatting, linting, type checking.
2.  **Unit tests:** isolated function and component behavior.
3.  **Integration tests:** interaction among modules/services.
4.  **Build checks:** application compiles and bundles.
5.  **End-to-end tests:** real user journeys.
6.  **Browser/UI checks:** layout, interaction, responsive behavior,
    console errors.
7.  **Diff review:** accidental changes, deleted behavior, generated
    files, secrets.
8.  **Security checks:** authorization, input validation, dependency and
    secret exposure.
9.  **Manual confirmation:** where automated evidence is insufficient.

Not every task requires every layer. The planner should select checks
proportionate to risk.

### 12.2 Verification matrix

  -----------------------------------------------------------------------
  Claim                               Minimum evidence
  ----------------------------------- -----------------------------------
  "TypeScript passes"                 Actual type-check command and exit
                                      code

  "Tests pass"                        Test command, summary, and exit
                                      code

  "Build succeeds"                    Build command and exit code

  "UI works"                          Browser journey and observed state;
                                      screenshots when useful

  "Bug fixed"                         Reproduction before/after or
                                      regression test

  "No unrelated changes"              Git diff/status review

  "Secure"                            Specific checks and scope; never a
                                      blanket guarantee
  -----------------------------------------------------------------------

### 12.3 When verification fails

The agent should: 1. Preserve the failing output. 2. Identify whether
the failure is caused by its change, an environment issue, or an
existing problem. 3. Avoid hiding or rewriting the failure. 4. Create a
targeted fix or ask for help if blocked. 5. Re-run the relevant check.
6. Report any checks that could not be run.

A failed test is useful evidence. It is not a reason to fabricate a pass
or silently weaken the test.

------------------------------------------------------------------------

## 13. Asynchronous execution, cancellation, and recovery

Long-running tasks require a lifecycle beyond one HTTP request.

### 13.1 Asynchronous execution

The UI should be able to start a task, receive a task ID, and subscribe
to progress events while the worker continues. The user can switch
conversations or workspaces without losing the task's state.

### 13.2 Cancellation

Cancellation should propagate through: - The orchestrator. - Active
model requests where supported. - Child tasks. - Terminal processes and
process trees. - Browser sessions. - Queued work.

Cancellation is not complete until active processes have stopped or the
system reports which process could not be stopped.

### 13.3 Crash recovery

Persist state transitions and tool results. After a restart: - Recover
tasks that were queued. - Mark interrupted tool calls accurately. -
Reconcile processes that may still be running. - Do not blindly repeat
non-idempotent actions such as publishing, deploying, charging, or
sending messages. - Resume from the last safe checkpoint where possible.

### 13.4 Budgets and runaway prevention

Set explicit limits for: - Model calls and tokens. - Tool calls. -
Concurrent subagents. - Subagent depth. - Wall-clock time. - Terminal
runtime. - Output size. - Browser actions. - Retries.

A task should stop with a clear reason when its budget is reached. Never
let an agent spawn agents recursively without bounds.

### 13.5 Scheduled tasks

Some Antigravity 2.0 features include scheduled tasks. A comparable
system should treat schedules as triggers that create normal, auditable
task runs. Store schedule definitions separately from run history,
enforce permissions at execution time, and prevent a scheduled task from
inheriting broader privileges than the user intended.

------------------------------------------------------------------------

## 14. Failure modes and design responses

  -----------------------------------------------------------------------
  Failure mode            Why it happens          Design response
  ----------------------- ----------------------- -----------------------
  Agent edits the wrong   Poor retrieval or stale Search symbols, inspect
  file                    context                 call sites, confirm
                                                  paths before patching

  Endless tool loop       No explicit stopping    State machine, budgets,
                          criteria                progress checks,
                                                  repeated-action
                                                  detection

  Hallucinated test       Model reports expected  Require tool-backed
  success                 outcome instead of tool evidence for
                          evidence                verification claims

  Conflicting subagents   Shared file ownership   File ownership, task
                          or incompatible plans   dependencies,
                                                  integration review

  Context overflow        Too much raw transcript Retrieval,
                          or repository content   summarization, context
                                                  budgets

  Dangerous shell command Broad tool permissions  Sandboxing, risk
                          or malicious input      classification,
                                                  approval gate

  Prompt injection from a Untrusted content       Instruction hierarchy,
  webpage                 treated as instruction  data labeling,
                                                  permission checks

  Broken UI despite       No real browser         Playwright/browser
  passing build           verification            checks and screenshots

  Duplicate actions after Retrying non-idempotent Idempotency keys,
  crash                   operations              persisted action
                                                  status, reconciliation

  Slow or expensive tasks Unbounded loops or      Budgets, model routing,
                          unsuitable model        timeouts, caching

  Stale memory            Old project facts are   Timestamped knowledge
                          trusted                 and live verification

  Secret leakage          Sensitive files or      Secret scanning,
                          command output enter    redaction, scoped
                          model context           credentials,
                                                  deny-by-default access

  User cannot tell what   Only chat text is shown Task status, diffs,
  happened                                        artifacts,
                                                  evidence-linked
                                                  walkthrough
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 15. Implementation roadmap for a comparable product

For a project using Electron, React, TypeScript, Monaco, a terminal, and
multiple model providers, implement a reliable vertical slice before
adding every advanced feature.

### Phase 1 --- Desktop foundation

-   Electron shell with secure renderer isolation.
-   React/TypeScript application.
-   Monaco editor and file tree.
-   Agent chat panel.
-   Basic project/workspace selection.
-   Typed IPC contracts.
-   No unrestricted Node APIs in the renderer.

**Exit criterion:** Open a project and edit files safely.

### Phase 2 --- One reliable agent loop

-   Provider interface for one model.
-   Context retrieval from the selected project.
-   Structured tool-call schema.
-   Read-file, search, patch, and terminal tools.
-   Permission checks before execution.
-   Streaming progress and cancellation.
-   Persisted task state.

**Exit criterion:** Ask for a small change, inspect the patch, run a
test, and see truthful results.

### Phase 3 --- Artifacts and review

-   Task lists and implementation plans.
-   Diff viewer.
-   Test evidence.
-   Final walkthrough.
-   Artifact comments/feedback.
-   Audit log.

**Exit criterion:** A user can review what changed and why without
reading every raw tool call.

### Phase 4 --- Verification and browser

-   Playwright integration.
-   Start/stop development servers.
-   Browser journeys and screenshots.
-   Test selection based on changed files.
-   Clear failed/blocked/not-run statuses.

**Exit criterion:** A UI change is tested in a real browser and the
evidence is attached to the task.

### Phase 5 --- Multi-provider gateway

-   Add OpenAI, Anthropic, Gemini, and local model adapters.
-   Normalize tool calls, streaming, usage, and errors.
-   Detect capabilities per model.
-   Configure fallback behavior without silently changing user settings.
-   Add rate-limit and budget controls.

**Exit criterion:** The same small task works with each supported
provider where that provider has the required capabilities.

### Phase 6 --- Subagents

-   Parent/child task model.
-   Delegation contract and structured results.
-   Concurrency, ownership, cancellation, and budgets.
-   Parent integration and review.
-   Prevent unbounded recursion.

**Exit criterion:** Two independent subtasks can run in parallel and
merge without corrupting shared work.

### Phase 7 --- Rules, skills, and MCP

-   Project instructions such as `AGENTS.md`.
-   Reusable task workflows.
-   Skill discovery and loading.
-   MCP server registry and per-tool permissions.
-   Tool schemas and audit events.

**Exit criterion:** A project can customize behavior without bypassing
the security layer.

### Phase 8 --- Hardening

-   Sandbox terminal execution.
-   Secret redaction.
-   Prompt-injection defenses.
-   Crash recovery.
-   Resource limits.
-   Signed/secure updates and packaging.
-   Security testing and dependency review.

**Exit criterion:** Risky actions are constrained, failures are
recoverable, and the system provides an honest audit trail.

### Phase 9 --- Advanced orchestration

-   Task scheduling.
-   Multi-project management.
-   Background workers.
-   More sophisticated retrieval.
-   Usage analytics and cost controls.
-   Optional remote execution environments.

**Exit criterion:** Long-running work can be managed without making the
basic local workflow fragile.

------------------------------------------------------------------------

## 16. Design principles to preserve

1.  **Outcome over chat:** the agent owns a task and its acceptance
    criteria.
2.  **Observe before acting:** inspect relevant code and state before
    editing.
3.  **Plan proportionately:** small tasks should stay lightweight; large
    tasks should have reviewable plans.
4.  **Tools are real capabilities:** every action executes through a
    validated, permissioned adapter.
5.  **Artifacts over claims:** show diffs, test output, screenshots, and
    walkthroughs.
6.  **Verification is a first-class phase:** a task is not done merely
    because code was written.
7.  **Bound autonomy:** budgets, timeouts, cancellation, approval gates,
    and scoped tools are mandatory.
8.  **Parallelize only independent work:** define ownership and
    reconcile results.
9.  **Preserve user control:** make status, permissions, diffs, and
    cancellation visible.
10. **Be truthful about evidence:** distinguish passed, failed, blocked,
    and not run.
11. **Keep providers interchangeable:** do not bind the whole system to
    one model's tool-call format.
12. **Treat external content as untrusted:** webpages and repository
    files cannot grant themselves authority.
13. **Recover safely:** persist enough state to resume without
    duplicating dangerous actions.
14. **Start simple:** a dependable single-agent loop is more valuable
    than a complex multi-agent demo that cannot verify its work.

------------------------------------------------------------------------

## 17. What is publicly documented versus inferred

### Publicly described by Google

-   Antigravity's agent uses a reasoning model, tools, artifacts, and
    knowledge.
-   The agent can reason over code and use tools, including browser
    capabilities.
-   The IDE supports agents working across editor, terminal, and
    browser.
-   Multiple agent conversations can run in parallel.
-   Artifacts can include plans, task lists, diffs, walkthroughs,
    screenshots, and browser recordings.
-   Rules, workflows, agent settings, and MCP are customization
    concepts.
-   Antigravity 2.0 describes dynamic subagents and asynchronous task
    management.
-   Antigravity 2.0 introduces scheduled tasks and project-level
    organization.
-   Permission settings control actions such as terminal execution and
    filesystem/tool access.
-   Google documents an Antigravity agent via Gemini API, including
    tool-driven interactions and environment customization.

### Not established by public documentation

-   A fixed total number of internal agents.
-   The exact internal source code, prompts, private service boundaries,
    or orchestration algorithms.
-   That every named role in this document exists as a separate
    Antigravity agent.
-   That every feature is available in every Antigravity surface,
    operating system, account, or version.
-   That a suggested stack or data schema in this file matches Google's
    implementation.

The recommended architecture, role table, state machine, JSON examples,
and roadmap are design guidance for building a similar system---not
claims about private internals.

------------------------------------------------------------------------

## 18. Official references

1.  **Google Antigravity IDE overview** --- product surfaces, editor,
    asynchronous agents, browser agent, artifacts.\
    https://www.antigravity.google/docs/ide/overview/

2.  **Agent capabilities overview** --- reasoning model, tools,
    artifacts, knowledge, customizations, and parallel conversations.\
    https://www.antigravity.google/docs/agent

3.  **Google Antigravity overview** --- Antigravity 2.0, projects,
    asynchronous tasks, subagents, and product ecosystem.\
    https://www.antigravity.google/docs/overview

4.  **Antigravity 2.0 announcement** --- dynamic subagents, asynchronous
    task management, scheduled tasks, and agent-first product design.\
    https://antigravity.google/blog/introducing-antigravity-2

5.  **Original Antigravity announcement** --- agent-first development,
    autonomous editor/terminal/browser work, and artifacts.\
    https://antigravity.google/blog/introducing-google-antigravity

6.  **Agent settings** --- permission presets and access controls.\
    https://antigravity.google/docs/agent-settings

7.  **Antigravity agent for Gemini API** --- programmatic interactions,
    background execution, and customization using instructions and
    skills.\
    https://ai.google.dev/gemini-api/docs/antigravity-agent

8.  **Google Developers Blog: Antigravity platform introduction** ---
    agent orchestration and product goals.\
    https://developers.googleblog.com/en/build-with-google-antigravity-our-new-agentic-development-platform/

------------------------------------------------------------------------

## 19. Final takeaway

The important lesson from Antigravity is not "use a certain number of
agents." It is to build a **controlled, observable agent runtime**
around a capable model:

-   The model reasons and requests actions.
-   The orchestrator manages task state and decides what happens next.
-   Tools perform real operations under explicit permissions.
-   Subagents handle bounded, independent work.
-   Artifacts expose plans, diffs, and evidence.
-   Verification determines whether the requested outcome was actually
    achieved.
-   The user retains control over risk, approvals, and final review.

For a new AI coding desktop app, make the single-agent plan → tool →
observe → verify loop excellent first. Then add parallel agents, browser
automation, persistent knowledge, scheduling, and remote execution one
at a time.
