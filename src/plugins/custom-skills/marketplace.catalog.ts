import type { MarketplaceSkill } from "./custom-skills.types";

export const BUNDLED_MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  {
    slug: "typescript-strict-engineer",
    name: "TypeScript Strict Engineer",
    description: "Enforces zero-any typing, exhaustive pattern matching, functional immutability, and branded types.",
    category: "Development",
    author: "AgentSkillExchange",
    tags: ["typescript", "clean-code", "types", "best-practices"],
    version: "1.2.0",
    content: `# TypeScript Strict Engineering Skill

When generating, reviewing, or refactoring TypeScript code:
1. **Strict Type Safety**: Never use \`any\` or unvalidated type assertions (\`as UnknownType\`). Prefer \`unknown\` with type guards, \`zod\`, or narrowing functions.
2. **Branded & Nominal Types**: Use nominal/branded types for opaque IDs and validated strings (e.g. \`type UserId = string & { readonly __brand: unique symbol }\`).
3. **Immutability by Default**: Mark object properties and array parameters as \`readonly\`. Avoid in-place mutations; return fresh state using spread or immutable transforms.
4. **Exhaustive Pattern Matching**: For discriminating unions, implement exhaustive checks via an \`assertNever(x: never): never\` helper to ensure full compiler coverage.
5. **Clear Error Returns**: Use Result/Either patterns or typed discriminated error unions instead of throwing arbitrary untyped exceptions in business logic.`,
  },
  {
    slug: "react-modern-patterns",
    name: "Modern React & Next.js Patterns",
    description: "Best practices for React 19, Server Components, optimistic mutations, and resilient state machines.",
    category: "Development",
    author: "AgentSkillExchange",
    tags: ["react", "nextjs", "frontend", "hooks", "performance"],
    version: "1.1.0",
    content: `# Modern React Patterns Skill

When building or updating React applications:
1. **Hooks & Composition**: Favor small, dedicated custom hooks over bulky monolithic components. Keep state close to where it is consumed.
2. **Optimistic UI Updates**: Use optimistic state transitions for mutations so user interactions feel instantaneous, with automatic rollback on network failure.
3. **Memoization & Render Budget**: Only introduce \`useMemo\` and \`useCallback\` around expensive computations or when stabilizing dependencies for referential equality in effects.
4. **Server vs. Client Boundaries**: In SSR/Next.js architectures, keep leaf components as client components (\`"use client"\`) and leaf nodes, keeping parents as Server Components.
5. **Accessibility (a11y)**: Ensure all interactive elements have semantic HTML, keyboard navigation, visible focus rings, and proper ARIA attributes.`,
  },
  {
    slug: "python-fastapi-architect",
    name: "Python FastAPI Clean Architect",
    description: "Idiomatic async Python, Pydantic v2 schemas, dependency injection, and clean layered architecture.",
    category: "Development",
    author: "AgentSkillExchange",
    tags: ["python", "fastapi", "backend", "pydantic", "async"],
    version: "1.0.4",
    content: `# Python FastAPI Clean Architecture Skill

When architecting or writing FastAPI applications:
1. **Pydantic v2 Schemas**: Separate Request and Response models. Use strict validation, explicit field descriptions, and custom validators via \`@field_validator\`.
2. **Dependency Injection**: Encapsulate database sessions, current authenticated user, and external clients as reusable FastAPI \`Depends()\` providers.
3. **Async / Non-Blocking**: Use async drivers (e.g., \`asyncpg\`, \`httpx.AsyncClient\`). Never run blocking CPU-heavy or synchronous I/O in async route handlers without \`run_in_threadpool\`.
4. **Layered Structure**: Follow Domain-Driven / Clean Architecture: Controllers (Routers) -> Services (Business Logic) -> Repositories (Data Access).
5. **Structured Logging**: Emit JSON structured logs with correlation/request IDs for distributed tracing.`,
  },
  {
    slug: "golang-concurrency-pro",
    name: "Go Concurrency & Systems Pro",
    description: "Goroutines, channels, context cancellation, worker pools, and memory-conscious Go design.",
    category: "Development",
    author: "AgentSkillExchange",
    tags: ["golang", "concurrency", "backend", "goroutines"],
    version: "1.0.1",
    content: `# Go Concurrency & Systems Skill

When writing or reviewing Go code:
1. **Context Propagation**: Always accept \`ctx context.Context\` as the first parameter in I/O operations and respect \`ctx.Done()\` immediately.
2. **Goroutine Lifetime**: Never launch a goroutine without knowing how and when it will terminate. Avoid goroutine leaks with \`sync.WaitGroup\` or \`errgroup.Group\`.
3. **Channel Ownership**: The sender should own and close the channel. Prefer channels for passing ownership of data and mutexes for protecting shared state.
4. **Error Handling**: Wrap errors with context using \`fmt.Errorf("action description: %w", err)\` and inspect with \`errors.Is\` / \`errors.As\`.
5. **Zero Allocations in Hot Paths**: Use \`sync.Pool\` for high-throughput buffers and avoid unnecessary heap escapes.`,
  },
  {
    slug: "rust-systems-developer",
    name: "Rust Systems Developer",
    description: "Idiomatic Rust, ownership and borrow checker mastery, zero-cost abstractions, and robust error handling.",
    category: "Development",
    author: "AgentSkillExchange",
    tags: ["rust", "systems", "performance", "memory-safety"],
    version: "1.0.0",
    content: `# Rust Systems Development Skill

When writing or refactoring Rust code:
1. **Ownership & Borrowing**: Minimize unnecessary \`.clone()\`. Design structs to borrow with lifetimes only when lifetime scope is naturally bounded.
2. **Robust Errors**: Use \`thiserror\` for domain-specific library errors and \`anyhow\` for applications. Avoid \`unwrap()\` and \`expect()\` in production paths.
3. **Traits & Generics**: Prefer trait bounds (\`impl Trait\` or \`<T: Trait>\`) over dynamic dispatch (\`&dyn Trait\`) unless runtime polymorphism is required.
4. **Safe Concurrency**: Use channels (\`crossbeam\` or \`tokio::sync::mpsc\`) or \`Arc<Mutex<T>>\` / \`Arc<RwLock<T>>\`. Strive for lock-free atomic patterns where appropriate.
5. **Safety**: Never use \`unsafe\` without an explicit \`// SAFETY:\` comment explaining why the invariants cannot be violated.`,
  },
  {
    slug: "security-vulnerability-auditor",
    name: "Security Vulnerability Auditor",
    description: "Audits code against OWASP Top 10, injection flaws, authorization bypasses, and insecure deserialization.",
    category: "Security",
    author: "AgentSkillExchange",
    tags: ["security", "owasp", "audit", "pentest", "vulnerabilities"],
    version: "1.3.0",
    content: `# Security Vulnerability Auditor Skill

When reviewing code or architecture for security risks:
1. **Injection Prevention**: Verify that all database queries use parameterized prepared statements. Disallow raw string concatenation in SQL, shell executions, and LDAP queries.
2. **Broken Object Level Authorization (BOLA/IDOR)**: Check that every access to a record verifies that the authenticated tenant/user owns or is permitted to view that entity.
3. **Input Sanitization & Output Encoding**: Ensure user input is validated against strict whitelists and encoded context-sensitively before rendering (XSS prevention).
4. **Secret Handling**: Flag any hardcoded API keys, passwords, private certificates, or insecure tokens in source code or client bundles.
5. **Cryptographic Standards**: Ensure AES-GCM or ChaCha20-Poly1305 is used for symmetric encryption, Argon2id/bcrypt for password hashing, and TLS 1.3 for in-transit communication.`,
  },
  {
    slug: "api-pentest-advisor",
    name: "API Pentest & Hardening Advisor",
    description: "Hardens REST and GraphQL APIs against brute-force, SSRF, mass assignment, and CORS misconfigurations.",
    category: "Security",
    author: "AgentSkillExchange",
    tags: ["security", "api", "hardening", "cors", "rate-limiting"],
    version: "1.1.2",
    content: `# API Pentest & Hardening Advisor Skill

When designing or testing API endpoints:
1. **Rate Limiting & Throttling**: Recommend distributed token-bucket or sliding-window rate limiting per IP and per authenticated user/token.
2. **Mass Assignment**: Ensure incoming request payloads are strictly bound to dedicated DTOs; never blindly update database entities directly from request bodies.
3. **SSRF Protections**: Validate and restrict outbound webhook URLs against private IP ranges (RFC 1918, RFC 3927, loopback 127.0.0.1, and cloud metadata 169.254.169.254).
4. **Security Headers**: Require strict security headers: \`Content-Security-Policy\`, \`X-Content-Type-Options: nosniff\`, \`Strict-Transport-Security\`, and restrictive \`Access-Control-Allow-Origin\`.
5. **Error Masking**: Ensure stack traces, database schema details, and internal network addresses are never exposed to public API clients.`,
  },
  {
    slug: "docker-container-hardening",
    name: "Docker Container Hardening",
    description: "Multi-stage builds, non-root users, distroless runtimes, and vulnerability-minimized images.",
    category: "DevOps",
    author: "AgentSkillExchange",
    tags: ["docker", "containers", "devops", "security", "ci-cd"],
    version: "1.0.5",
    content: `# Docker Container Hardening Skill

When creating or optimizing Dockerfiles:
1. **Multi-Stage Builds**: Build artifacts in a heavy builder stage, and copy only production binaries/dependencies into a minimal base runtime (Alpine, Distroless, or Scratch).
2. **Non-Root Execution**: Always declare \`USER nonroot:nonroot\` or a dedicated UID/GID (e.g. \`USER 10001\`) before the entrypoint. Never run containers as root.
3. **Read-Only Root Filesystem**: Configure containers to run with \`read_only: true\` root filesystems, mounting ephemeral writable storage exclusively on \`/tmp\`.
4. **Layer Optimization**: Order directives from least frequently changed to most frequently changed to maximize Docker layer cache hits.
5. **Healthchecks & Signals**: Include explicit \`HEALTHCHECK\` commands and ensure process PID 1 forwards SIGTERM gracefully.`,
  },
  {
    slug: "kubernetes-manifest-architect",
    name: "Kubernetes Manifest Architect",
    description: "Production-grade Deployments, HPA, PodDisruptionBudgets, and SecurityContext specifications.",
    category: "DevOps",
    author: "AgentSkillExchange",
    tags: ["kubernetes", "k8s", "devops", "cloud", "infra"],
    version: "1.2.1",
    content: `# Kubernetes Manifest Architect Skill

When writing or reviewing Kubernetes manifests:
1. **Resource Requests & Limits**: Every container must specify \`resources.requests\` and \`resources.limits\` for CPU and memory to prevent noisy neighbor and OOM kills.
2. **Probes**: Implement distinct \`livenessProbe\` (detects deadlocks) and \`readinessProbe\` (detects readiness to serve traffic without restarting the container).
3. **Pod Security Standards**: Enforce \`securityContext\` with \`runAsNonRoot: true\`, \`allowPrivilegeEscalation: false\`, and \`capabilities.drop: ["ALL"]\`.
4. **High Availability**: Pair multi-replica Deployments with \`PodDisruptionBudget\` and \`topologySpreadConstraints\` to survive node drainage and zone outages.
5. **Config & Secrets**: Decouple configuration using \`ConfigMap\` and sensitive credentials via \`Secret\` or External Secrets Operator.`,
  },
  {
    slug: "sql-optimization-advisor",
    name: "SQL & Database Optimization Advisor",
    description: "EXPLAIN plan analysis, index selection (B-Tree, GIN, Partial), connection pooling, and query refactoring.",
    category: "Database",
    author: "AgentSkillExchange",
    tags: ["sql", "postgresql", "mysql", "performance", "indexing"],
    version: "1.1.0",
    content: `# SQL & Database Optimization Advisor Skill

When optimizing relational database queries and schemas:
1. **Execution Plans**: Analyze \`EXPLAIN (ANALYZE, BUFFERS)\` output to spot sequential table scans, costly nested loops, and memory spill-to-disk sorts.
2. **Targeted Indexing**: Recommend composite indexes following the Equality-Range-Sort rule. Use Partial Indexes for filtered queries to save disk and memory.
3. **N+1 Query Elimination**: Detect and replace iterative loop queries with batch queries, \`JOIN\`s, or JSON aggregation (\`json_agg\` / \`jsonb_build_object\`).
4. **Pagination at Scale**: Avoid \`OFFSET n\` on large tables; use Keyset / Cursor-based pagination (\`WHERE id > :last_id ORDER BY id LIMIT 20\`).
5. **Connection Pooling**: Recommend PgBouncer or proxy connection pools with transaction-level pooling for high-concurrency workloads.`,
  },
  {
    slug: "clean-code-refactorer",
    name: "Clean Code & Refactoring Specialist",
    description: "Identifies code smells, applies SOLID principles, improves naming clarity, and simplifies cyclomatic complexity.",
    category: "Code Quality",
    author: "AgentSkillExchange",
    tags: ["refactoring", "clean-code", "architecture", "patterns"],
    version: "1.4.0",
    content: `# Clean Code & Refactoring Specialist Skill

When improving and refactoring existing codebases:
1. **Single Responsibility**: Each function or class should have exactly one reason to change. Extract helper functions when a method handles multiple abstraction levels.
2. **Early Returns & Guard Clauses**: Eliminate nested \`if/else\` structures by validating inputs at the top and returning early.
3. **Intent-Revealing Naming**: Replace vague variable names (\`data\`, \`res\`, \`temp\`, \`flag\`) with precise, intention-revealing names that describe the business domain.
4. **Pure Functions & Side Effects**: Isolate side effects (I/O, database mutations, state changes) to the outer edges of the system, keeping core logic pure and easily testable.
5. **Boy Scout Rule**: Always leave the touched code cleaner and better tested than when you found it.`,
  },
  {
    slug: "unit-test-craftsman",
    name: "Unit & Integration Test Craftsman",
    description: "Test-Driven Development (TDD), boundary condition testing, AAA pattern, and high-fidelity mocking.",
    category: "Testing & QA",
    author: "AgentSkillExchange",
    tags: ["testing", "tdd", "jest", "vitest", "unit-tests"],
    version: "1.1.1",
    content: `# Unit & Integration Test Craftsman Skill

When writing and reviewing tests:
1. **Arrange-Act-Assert (AAA)**: Keep every test structured into three distinct phases: set up test fixtures, execute the unit under test, and verify the outcome.
2. **Behavior Over Implementation**: Test what the code does from the public API perspective, not internal private implementation details or state.
3. **Boundary & Edge Cases**: Always test null/undefined inputs, empty arrays, unicode strings, boundary integers (0, MAX_INT), and network timeouts.
4. **Deterministic & Fast**: Tests must be hermetic and isolated. Avoid shared global state, sleeps, or real network dependencies. Use test doubles and in-memory stores.
5. **Clear Failure Messages**: Craft assertions so that when a test fails, the error message immediately clarifies what went wrong without needing a debugger.`,
  },
  {
    slug: "pull-request-reviewer",
    name: "Senior Pull Request Reviewer",
    description: "Provides thoughtful, constructive, empathetic code reviews with actionable snippets and risk assessments.",
    category: "Code Quality",
    author: "AgentSkillExchange",
    tags: ["code-review", "git", "collaboration", "quality"],
    version: "1.0.3",
    content: `# Senior Pull Request Reviewer Skill

When reviewing pull requests:
1. **Constructive & Empathetic Tone**: Phrase feedback constructively (e.g., "What do you think about..." or "Consider..." rather than "You did this wrong").
2. **Actionable Suggestions**: For every non-trivial critique, provide a concrete code snippet demonstrating the recommended fix.
3. **Severity Categorization**: Prefix comments with priority levels: \`[Blocking]\`, \`[Suggestion]\`, \`[Nitpick]\`, or \`[Question]\` so authors know what is critical.
4. **Holistic Impact**: Look beyond individual lines: check backward compatibility, database migration safety, API contract changes, and performance implications.
5. **Appreciation**: Highlight clever solutions, clean patterns, and well-written tests in the PR.`,
  },
  {
    slug: "technical-documentation-writer",
    name: "Technical Documentation Writer",
    description: "Writes clear API references, Architecture Decision Records (ADR), quickstart guides, and system designs.",
    category: "Documentation",
    author: "AgentSkillExchange",
    tags: ["docs", "technical-writing", "markdown", "api-reference"],
    version: "1.2.0",
    content: `# Technical Documentation Writer Skill

When creating technical documentation:
1. **Audience-Centric Structure**: Start with the "Why" and "What", followed by quick copy-pasteable examples before diving into detailed specifications.
2. **Working Code Examples**: Every code sample must be complete, syntactically valid, and include realistic inputs and expected outputs.
3. **Architecture Decision Records (ADR)**: When explaining system designs, document Context, Decision, Consequences (pros and cons), and Alternatives considered.
4. **Visual Aids & Diagrams**: Use GitHub Flavored Markdown and Mermaid diagrams (\`flowchart\`, \`sequenceDiagram\`) to illustrate complex data flows.
5. **Conciseness & Scannability**: Use tables, bulleted lists, and bold callouts instead of long, impenetrable walls of text.`,
  },
  {
    slug: "prompt-engineering-optimizer",
    name: "Prompt Engineering Optimizer",
    description: "Systematic prompt design, few-shot demonstrations, role definition, and output structure enforcement.",
    category: "AI & Prompts",
    author: "AgentSkillExchange",
    tags: ["prompts", "prompt-engineering", "llm", "few-shot"],
    version: "1.5.0",
    content: `# Prompt Engineering Optimizer Skill

When designing or refining prompts for Large Language Models:
1. **Role & Persona Definition**: Define clear expertise, tone, and operational boundaries at the very beginning of the prompt.
2. **Delimited Context**: Use XML or Markdown tags (e.g., \`<context>\`, \`<rules>\`, \`<examples>\`) to distinctly separate instructions from user input.
3. **Few-Shot Demonstrations**: Provide 2-3 high-quality input-output examples demonstrating edge cases and the desired formatting style.
4. **Constrained Output Formatting**: Explicitly define the output schema (JSON, Markdown, YAML) and forbid preamble or conversational filler when automated parsing is required.
5. **Chain-of-Thought Guidance**: Instruct models to think step-by-step or plan in a hidden scratchpad before emitting final decisions for complex reasoning tasks.`,
  },
];
