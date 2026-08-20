// Local, hand-maintained declaration of the PUBLIC OMP Extension API surface used by
// WEConverge. Authored from the probed upstream source
// (packages/coding-agent/src/extensibility/extensions/types.ts + shared-events.ts).
//
// Reproducible resolution (2026-08-20 contract: no hardcoded absolute paths):
//  - tsconfig.extension.json maps "@oh-my-pi/pi-coding-agent" to THIS file, so the
//    project typechecks anywhere without an OMP checkout;
//  - `node scripts/sync-omp-types.mjs` verifies every declared member against a real
//    OMP source tree when one is discoverable (env OMP_SOURCE_DIR, or a sibling
//    ../../github/oh-my-pi checkout), and fails on drift. The project never depends
//    on a machine-specific absolute path.

declare module "@oh-my-pi/pi-coding-agent" {
  export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";

  export interface Model {
    id: string;
    provider?: string;
  }

  export interface ExtensionModelQuery {
    list(): Model[];
    current(): Model | undefined;
    resolve(spec: string): Model | undefined;
    family(model: Model): string;
  }

  export interface SessionEntry {
    id?: string;
    parentId?: string | null;
    type?: string;
    customType?: string;
    data?: unknown;
    timestamp?: string;
  }

  export interface ReadonlySessionManager {
    getCwd(): string;
    getSessionDir(): string;
    getSessionId(): string;
    getSessionFile(): string | undefined;
    getSessionName(): string | undefined;
    getLeafId(): string | null;
    getEntry(id: string): SessionEntry | undefined;
    getBranch(fromId?: string): SessionEntry[];
    getEntries(): SessionEntry[];
  }

  export interface ExtensionUIContext {
    notify(message: string, type?: "info" | "warning" | "error"): void;
    confirm(title: string, message: string): Promise<boolean>;
  }

  export interface ExtensionContext {
    ui: ExtensionUIContext;
    hasUI: boolean;
    cwd: string;
    sessionManager: ReadonlySessionManager;
    model: Model | undefined;
    models: ExtensionModelQuery;
    isIdle(): boolean;
    abort(): void;
    getSystemPrompt(): string[];
  }

  export interface ExtensionCommandContext extends ExtensionContext {
    waitForIdle(): Promise<void>;
    newSession(options?: {
      parentSession?: string;
      setup?: (sessionManager: unknown) => Promise<void>;
    }): Promise<{ cancelled: boolean }>;
  }

  // ---- events ----
  export interface SessionStartEvent {
    type: "session_start";
  }
  export interface SessionShutdownEvent {
    type: "session_shutdown";
  }
  export interface SessionBeforeSwitchEvent {
    type: "session_before_switch";
    reason: "new" | "resume" | "fork" | "handoff";
    targetSessionFile?: string;
  }
  export interface SessionSwitchEvent {
    type: "session_switch";
    reason: "new" | "resume" | "fork" | "handoff";
    previousSessionFile: string | undefined;
  }
  export interface SessionStopEvent {
    type: "session_stop";
    session_id: string;
    session_file?: string;
    stop_hook_active: boolean;
  }
  export interface SessionStopEventResult {
    continue?: boolean;
    additionalContext?: string;
    decision?: "block";
    reason?: string;
  }
  export interface AgentEndEvent {
    type: "agent_end";
    messages: unknown[];
    willContinue?: boolean;
  }
  export interface TurnEndEvent {
    type: "turn_end";
    turnIndex: number;
  }
  export interface BeforeAgentStartEvent {
    type: "before_agent_start";
    prompt: string;
    systemPrompt: string[];
  }
  export interface BeforeAgentStartEventResult {
    message?: unknown;
    systemPrompt?: string[];
  }
  export interface AfterProviderResponseEvent {
    type: "after_provider_response";
    requestId?: string;
    status?: number;
    headers?: Record<string, string>;
    metadata?: Record<string, unknown>;
  }

  export type ExtensionHandler<E, R = void> = (event: E, ctx: ExtensionContext) => R | void | Promise<R | void>;

  // ---- tool / command registration ----
  export interface ZodShim {
    object(shape: Record<string, unknown>): ZodShim;
    string(): ZodShim;
    boolean(): ZodShim;
    array(inner: ZodShim): ZodShim;
    optional(): ZodShim;
    passthrough(): ZodShim;
  }

  export interface AgentToolResult {
    content: Array<{ type: "text"; text: string }>;
    details?: unknown;
  }

  export interface ToolDefinition<TParams = unknown> {
    name: string;
    label?: string;
    description?: string;
    parameters: unknown;
    execute(
      toolCallId: string,
      params: TParams,
      signal: AbortSignal,
      onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult>;
  }

  export interface RegisteredCommandOptions {
    description?: string;
    handler(args: string, ctx: ExtensionCommandContext): void | Promise<void>;
  }

  export interface ExtensionLogger {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  }

  export interface ExtensionAPI {
    readonly zod: ZodShim;
    readonly logger: ExtensionLogger;

    on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
    on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
    on(event: "session_before_switch", handler: ExtensionHandler<SessionBeforeSwitchEvent, Record<string, never>>): void;
    on(event: "session_switch", handler: ExtensionHandler<SessionSwitchEvent>): void;
    on(event: "session_stop", handler: ExtensionHandler<SessionStopEvent, SessionStopEventResult>): void;
    on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
    on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
    on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>): void;
    on(event: "after_provider_response", handler: ExtensionHandler<AfterProviderResponseEvent>): void;

    registerTool<TParams = unknown>(tool: ToolDefinition<TParams>): void;
    registerCommand(name: string, options: RegisteredCommandOptions): void;
    appendEntry<T = unknown>(customType: string, data?: T): void;
    getThinkingLevel(): ThinkingLevel | undefined;
    setThinkingLevel(level: ThinkingLevel): void;
    sendUserMessage(content: string): void;
  }
}
