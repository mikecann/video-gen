// Type-only stubs for electrobun/bun.
// Electrobun ships raw .ts source files as package exports, and its internal
// files can surface package type errors unrelated to this app.

type _BaseRequests = Record<string, { params: unknown; response: unknown }>;
type _BaseMessages = Record<never, unknown>;
type _InputSchema = { requests?: _BaseRequests; messages?: Record<string, unknown> };

type _OtherSide<S extends "bun" | "webview"> = S extends "bun" ? "webview" : "bun";

type _Proxy<RS extends _BaseRequests> = {
  [K in keyof RS]: RS[K]["params"] extends void
    ? () => Promise<RS[K]["response"]>
    : undefined extends RS[K]["params"]
      ? (params?: RS[K]["params"]) => Promise<RS[K]["response"]>
      : (params: RS[K]["params"]) => Promise<RS[K]["response"]>;
};

type _RPCResult<Schema extends ElectrobunRPCSchema, Side extends "bun" | "webview"> = {
  setTransport(t: unknown): void;
  request: _Proxy<Schema[_OtherSide<Side>]["requests"]>;
};

export type RPCSchema<I extends _InputSchema | void = void> = {
  requests: I extends { requests: infer R } ? R : _BaseRequests;
  messages: I extends { messages: infer M } ? M : _BaseMessages;
};

type _BaseResult = { requests: _BaseRequests; messages: _BaseMessages };

export interface ElectrobunRPCSchema {
  bun: _BaseResult;
  webview: _BaseResult;
}

export type ElectrobunRPCConfig<
  Schema extends ElectrobunRPCSchema,
  Side extends "bun" | "webview",
> = {
  maxRequestTime?: number;
  handlers: {
    requests?: {
      [K in keyof Schema[Side]["requests"]]?: (
        params: Schema[Side]["requests"][K]["params"],
      ) =>
        | Schema[Side]["requests"][K]["response"]
        | Promise<Schema[Side]["requests"][K]["response"]>;
    };
    messages?: Record<string, (payload: unknown) => void>;
  };
};

export declare class BrowserView {
  static defineRPC<Schema extends ElectrobunRPCSchema>(
    config: ElectrobunRPCConfig<Schema, "bun">,
  ): _RPCResult<Schema, "bun">;
}

export declare class BrowserWindow {
  constructor(options: {
    title?: string;
    url?: string | null;
    frame?: { x?: number; y?: number; width?: number; height?: number };
    rpc?: unknown;
    [key: string]: unknown;
  });
  setSize(width: number, height: number): unknown;
  getFrame(): { x: number; y: number; width: number; height: number };
}
