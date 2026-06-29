// Minimal flag parser.
// Supports: "--key value", "--key=value", boolean flags, -h/-v short forms,
// and positional arguments.

export function parseArgs(argv = []) {
  const result = { _: [], flags: {} };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        // "--key=value"
        result.flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        // "--key value" or boolean "--key"
        const key = body;
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          result.flags[key] = next;
          i++;
        } else {
          result.flags[key] = true;
        }
      }
      continue;
    }

    // positional
    result._.push(arg);
  }

  return result;
}
