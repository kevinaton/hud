#!/usr/bin/env tsx
/**
 * validate-mcp-config.ts
 *
 * Validates mcp-tokens.yaml and mcp-acl.yaml against their JSON Schema definitions.
 * Exits 0 if both files are valid. Exits 1 on any schema violation or missing file.
 *
 * Usage:
 *   tsx scripts/validate-mcp-config.ts [--tokens <path>] [--acl <path>]
 *
 * Defaults (suitable for CI):
 *   --tokens  ops/secrets/mcp-tokens.example.yaml
 *   --acl     ops/secrets/mcp-acl.example.yaml
 *
 * Override for server-side validation (run as agent-hud):
 *   tsx scripts/validate-mcp-config.ts \
 *     --tokens /srv/hud/secrets/mcp-tokens.yaml \
 *     --acl    /srv/hud/secrets/mcp-acl.yaml
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import Ajv, { type ErrorObject, type Options, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function resolveFromProject(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(projectRoot, p);
}

// ---------------------------------------------------------------------------
// Argument parsing (no external deps — this script must stay self-contained)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { tokensPath: string; aclPath: string } {
  const args = argv.slice(2);
  let tokensPath = 'ops/secrets/mcp-tokens.example.yaml';
  let aclPath = 'ops/secrets/mcp-acl.example.yaml';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tokens') {
      const next = args[i + 1];
      if (next !== undefined) {
        tokensPath = next;
        i++;
      }
    } else if (arg === '--acl') {
      const next = args[i + 1];
      if (next !== undefined) {
        aclPath = next;
        i++;
      }
    }
  }

  return { tokensPath, aclPath };
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function loadYaml(filePath: string): unknown {
  const abs = resolveFromProject(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  return yaml.load(raw);
}

function loadSchema(relativeFromRoot: string): Record<string, unknown> {
  const abs = resolveFromProject(relativeFromRoot);
  const raw = fs.readFileSync(abs, 'utf8');
  return yaml.load(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema compilation
// ---------------------------------------------------------------------------

function compileSchema(
  label: string,
  schema: Record<string, unknown>,
  ajv: InstanceType<typeof Ajv>,
): ValidateFunction | null {
  // Strip $schema declaration — AJV tries to resolve the meta-schema URI at
  // runtime which fails in offline CI. Our schemas use 2020-12 URIs but only
  // use draft-07-compatible keywords, so strict:false handles this cleanly.
  const compilable = { ...schema } as Record<string, unknown>;
  compilable.$schema = undefined;

  const schemaId = (compilable.$id as string | undefined) ?? label;

  try {
    const existing = ajv.getSchema(schemaId);
    if (existing !== undefined) return existing;
    return ajv.compile(compilable);
  } catch (err) {
    process.stderr.write(`Schema compilation error for ${label}: ${String(err)}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers (split out to keep main() complexity manageable)
// ---------------------------------------------------------------------------

function formatErrors(validateFn: ValidateFunction): string[] {
  return (validateFn.errors ?? []).map((e: ErrorObject) => {
    const location = e.instancePath !== '' ? e.instancePath : '(root)';
    return `  ${location}: ${e.message ?? 'unknown error'}`;
  });
}

function validateFile(
  label: string,
  filePath: string,
  schemaKey: string,
  schema: Record<string, unknown>,
  ajv: InstanceType<typeof Ajv>,
): boolean {
  process.stdout.write(`\nValidating ${label} file: ${filePath}\n`);

  let data: unknown = null;
  try {
    data = loadYaml(filePath);
  } catch (err) {
    process.stderr.write(`  ERROR: ${String(err)}\n`);
    return false;
  }

  const validateFn = compileSchema(schemaKey, schema, ajv);
  if (validateFn === null) return false;

  const ok = validateFn(data) as boolean;
  if (ok) {
    process.stdout.write(`  OK — ${label} file is valid.\n`);
    return true;
  }

  process.stderr.write('  INVALID — schema violations:\n');
  for (const errMsg of formatErrors(validateFn)) {
    process.stderr.write(`${errMsg}\n`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { tokensPath, aclPath } = parseArgs(process.argv);

  const ajvOptions: Options = { allErrors: true, strict: false };
  const ajv = new Ajv(ajvOptions);
  // addFormats types expect the Ajv instance; cast is safe here
  addFormats(ajv as Parameters<typeof addFormats>[0]);

  const tokensSchema = loadSchema('ops/schemas/mcp-tokens.schema.yaml');
  const aclSchema = loadSchema('ops/schemas/mcp-acl.schema.yaml');

  const tokensOk = validateFile('tokens', tokensPath, 'mcp-tokens', tokensSchema, ajv);
  const aclOk = validateFile('ACL', aclPath, 'mcp-acl', aclSchema, ajv);

  process.stdout.write('\n');
  if (tokensOk && aclOk) {
    process.stdout.write('All MCP config files are valid.\n');
    process.exit(0);
  } else {
    process.stderr.write('MCP config validation FAILED. Fix the errors above.\n');
    process.exit(1);
  }
}

main();
