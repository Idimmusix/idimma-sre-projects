export type ContextLoadTurn = {
  type: "context_load";
  timestamp: number;
  tokens: number;
  cacheStatus: "hit" | "miss";
};

export type ToolCallTurn = {
  type: "tool_call";
  timestamp: number;
  toolName: string;
  outputBytes: number;
  usefulBytes: number;
};

export type WaitTurn = {
  type: "wait";
  timestamp: number;
  waitSeconds: number;
};

export type Turn = ContextLoadTurn | ToolCallTurn | WaitTurn;

export type Trace = {
  cacheTtlSeconds: number;
  turns: Turn[];
};

export class TraceValidationError extends Error {}

export function validateTrace(input: unknown): Trace {
  if (typeof input !== "object" || input === null) {
    throw new TraceValidationError("Trace must be an object");
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.cacheTtlSeconds !== "number" || obj.cacheTtlSeconds <= 0) {
    throw new TraceValidationError("cacheTtlSeconds must be a positive number");
  }
  if (!Array.isArray(obj.turns)) {
    throw new TraceValidationError("turns must be an array");
  }

  const turns = obj.turns.map((turn, index) => validateTurn(turn, index));
  return { cacheTtlSeconds: obj.cacheTtlSeconds, turns };
}

function validateTurn(turn: unknown, index: number): Turn {
  if (typeof turn !== "object" || turn === null) {
    throw new TraceValidationError(`turns[${index}] must be an object`);
  }
  const obj = turn as Record<string, unknown>;

  if (typeof obj.timestamp !== "number") {
    throw new TraceValidationError(`turns[${index}].timestamp must be a number`);
  }

  switch (obj.type) {
    case "context_load": {
      if (typeof obj.tokens !== "number") {
        throw new TraceValidationError(`turns[${index}].tokens must be a number`);
      }
      if (obj.cacheStatus !== "hit" && obj.cacheStatus !== "miss") {
        throw new TraceValidationError(`turns[${index}].cacheStatus must be "hit" or "miss"`);
      }
      return {
        type: "context_load",
        timestamp: obj.timestamp,
        tokens: obj.tokens,
        cacheStatus: obj.cacheStatus,
      };
    }
    case "tool_call": {
      if (typeof obj.toolName !== "string") {
        throw new TraceValidationError(`turns[${index}].toolName must be a string`);
      }
      if (typeof obj.outputBytes !== "number" || typeof obj.usefulBytes !== "number") {
        throw new TraceValidationError(`turns[${index}].outputBytes and usefulBytes must be numbers`);
      }
      return {
        type: "tool_call",
        timestamp: obj.timestamp,
        toolName: obj.toolName,
        outputBytes: obj.outputBytes,
        usefulBytes: obj.usefulBytes,
      };
    }
    case "wait": {
      if (typeof obj.waitSeconds !== "number") {
        throw new TraceValidationError(`turns[${index}].waitSeconds must be a number`);
      }
      return { type: "wait", timestamp: obj.timestamp, waitSeconds: obj.waitSeconds };
    }
    default:
      throw new TraceValidationError(
        `turns[${index}].type must be one of "context_load", "tool_call", "wait"`
      );
  }
}
