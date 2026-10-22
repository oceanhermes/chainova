export interface ToolResult<T = unknown> {
  tool: string;
  ok: boolean;
  data?: T;
  error?: string;
  raw?: unknown;
  sources?: string[];
  durationMs: number;
}

export interface Tool {
  name: string;
  description: string;
  // JSON-schema-ish param descriptors for the agent + validation
  params: Record<string, { type: 'hash' | 'address' | 'uint'; required: boolean; description: string }>;
  execute(args: Record<string, string>): Promise<ToolResult>;
}
