export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export const MAX_TEXT_RESPONSE = 100_000;
