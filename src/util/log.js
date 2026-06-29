// Simple diagnostic logger. Output goes to stderr; command results go to stdout
// (console.log). ANSI colors can be disabled with the NO_COLOR env variable.

const useColor = !process.env.NO_COLOR;

const CODES = {
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  success: "\x1b[32m", // green
  dim: "\x1b[2m", // dim
};
const RESET = "\x1b[0m";

const GLYPHS = {
  info: "•",
  warn: "!",
  error: "✖",
  success: "✓",
  dim: "·",
};

function emit(level, msg) {
  const text = `${GLYPHS[level]} ${msg}`;
  if (useColor) {
    process.stderr.write(`${CODES[level]}${text}${RESET}\n`);
  } else {
    process.stderr.write(`${text}\n`);
  }
}

export const log = {
  info(msg) {
    emit("info", msg);
  },
  warn(msg) {
    emit("warn", msg);
  },
  error(msg) {
    emit("error", msg);
  },
  success(msg) {
    emit("success", msg);
  },
  dim(msg) {
    emit("dim", msg);
  },
};
