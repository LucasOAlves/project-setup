import { redact } from "./redact.js";

// Structured JSON-line logger for the worker (the API keeps Fastify's own logger). Every
// field passes through redact() before it is written, so a stray email or token in a job
// payload never reaches the log.
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

export type Logger = {
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
};

export function createLogger(base: Fields = {}, write: (line: string, level: Level) => void = defaultWrite): Logger {
  const log = (level: Level, msg: string, fields: Fields = {}) => {
    const entry = redact({ time: new Date().toISOString(), level, msg, ...base, ...fields });
    write(JSON.stringify(entry), level);
  };
  return {
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }, write),
  };
}

function defaultWrite(line: string, level: Level): void {
  if (level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}
