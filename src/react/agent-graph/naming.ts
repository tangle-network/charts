/**
 * Human-facing naming for workflow nodes. A definition addresses things by
 * machine identifier — an action kind (`agent.run`), a hub action path
 * (`github.pulls.reviews.create`), a profile slug (`pr-reviewer`) — and showing
 * those verbatim on a node makes the graph read like a config file. These turn
 * an identifier into the label a person would say out loud.
 *
 * Pure and dependency-free so the naming rules are unit-testable without the
 * YAML parser or a render.
 */

/** Identifier fragments that read as an initialism, so they are upper-cased
 *  whole rather than sentence-cased into "Pr" / "Api". */
const ACRONYMS = new Set([
  "ai",
  "api",
  "cd",
  "ci",
  "cli",
  "cpu",
  "css",
  "csv",
  "db",
  "dns",
  "gpu",
  "html",
  "http",
  "https",
  "id",
  "io",
  "ip",
  "json",
  "llm",
  "mcp",
  "ml",
  "pr",
  "qa",
  "sdk",
  "sla",
  "sql",
  "ssh",
  "ui",
  "url",
  "uuid",
  "vm",
  "yaml",
]);

/** How the first word of a humanized identifier is cased. An initialism is
 *  ALWAYS upper-cased whichever is chosen — that is the whole point of the table
 *  above, and `.toLowerCase()`ing the result afterwards silently undoes it
 *  ("List API keys" → "list api keys"). */
export type LeadCase = "sentence" | "lower" | "title";

/** Split a machine identifier into its words, on separators and camelCase humps. */
function words(id: string): string[] {
  return id
    .replace(/[._\-/]+/g, " ")
    // camelCase humps ("postMessage" → "post Message")…
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // …and the boundary at the END of a run of capitals, so an initialism keeps
    // the word that follows it ("listAPIKeys" → "list API Keys", not "APIKeys").
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Humanize a machine identifier: `pr-reviewer` → "PR reviewer", `sandbox.spawn`
 * → "Sandbox spawn", `postMessage` → "Post message". Known initialisms are
 * upper-cased wherever they appear; `lead` picks the case of the rest.
 *
 *  - `sentence` (default): "Create issue comment" — a label or a title.
 *  - `lower`: "create issue comment" — a fragment that sits INSIDE a phrase
 *    ("On pull request"), where a capital would read as a new sentence. An
 *    initialism still wins: `ci_run_completed` → "CI run completed", never
 *    "cI run completed".
 *  - `title`: "Google Sheets" — a brand/proper name.
 *
 * An identifier that carries no word characters is returned verbatim rather than
 * blanked.
 */
export function humanizeIdentifier(id: string, lead: LeadCase = "sentence"): string {
  const parts = words(id);
  if (parts.length === 0) return id;
  return parts
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
      if (lead === "title") return capitalized;
      if (i > 0) return lower;
      return lead === "lower" ? lower : capitalized;
    })
    .join(" ");
}

/** A model slug without its provider prefix (`anthropic/claude-sonnet-5` →
 *  `claude-sonnet-5`) — the vendor is noise on a card whose width is the scarce
 *  resource, and the full slug stays in the node's config for the detail view. */
export function shortModel(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

/** The parts of a hub action path (`<provider>.<resource…>.<operation>`). */
export interface ActionPathParts {
  /** The connector the action runs against (`github`). */
  provider: string;
  /** The trailing verb (`create`). */
  operation: string;
  /** Everything between provider and operation (`pulls.reviews`), when present —
   *  a two-segment path (`slack.postMessage`) has no resource. */
  resource?: string;
}

/** The charset a hub action path is made of (mirrors the server's path schema:
 *  `<provider>.<action…>`, letters/digits/`_`/`-` per segment). A value that
 *  isn't one — most importantly a `${…}` mapping expression, which also contains
 *  dots — must not be split into a bogus provider (whose brand logo we'd then go
 *  and fetch). */
const ACTION_PATH = /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/i;

/** Split a hub action path into provider / resource / operation. Null when the
 *  value isn't a dotted path (a `${…}` expression, or a bare word), so callers
 *  fall back to showing it verbatim instead of inventing structure. */
export function parseActionPath(path: string): ActionPathParts | null {
  if (!ACTION_PATH.test(path.trim())) return null;
  const segments = path.trim().split(".");
  const [provider, ...rest] = segments;
  const operation = rest[rest.length - 1];
  const resource = rest.length > 1 ? rest.slice(0, -1).join(".") : undefined;
  return { provider, operation, resource };
}

/**
 * The operation label for an action path, in n8n's `operation: resource` shape:
 * `github.pulls.reviews.create` → "create: pulls.reviews", `slack.postMessage`
 * → "post message". The provider names the node itself (its title + logo), so
 * it is deliberately absent here. A path we can't split is shown verbatim.
 */
export function actionPathLabel(path: string): string {
  const parts = parseActionPath(path);
  if (!parts) return path;
  const operation = humanizeIdentifier(parts.operation, "lower");
  return parts.resource ? `${operation}: ${parts.resource}` : operation;
}
