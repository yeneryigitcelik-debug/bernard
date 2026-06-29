# Security Policy

## Supported versions

bernard is pre-1.0 and developed on a rolling basis. Security fixes target the
latest published version of `bernard-mcp`.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a vulnerability

**Please do not report security issues in public GitHub issues.**

Report privately through one of:

- GitHub → the repository's **Security** tab → **Report a vulnerability**
  (private advisory), or
- Email **yeneryigitcelik@gmail.com** with details and reproduction steps.

Please include: affected version, a description of the issue, reproduction
steps or a proof of concept, and the potential impact. We aim to acknowledge
reports within a few days and to keep you updated on the fix.

## Scope notes

bernard is designed to minimize attack surface:

- It makes **no network calls** and requires **no API keys** — there are no
  credentials to leak and no remote endpoints to attack.
- All data stays in the user's repository as local files.

The areas most worth scrutiny are therefore local in nature, for example:
filesystem writes (`.bernard/`, `.git/hooks/post-commit`, `.gitignore`,
`.gitattributes`), parsing of `records.jsonl` / config / category files, the
git subprocess helpers, and the MCP tool inputs. Reports in these areas are
especially welcome.
