import { describe, expect, it } from "vitest";
import {
  actionPathLabel,
  humanizeIdentifier,
  parseActionPath,
  shortModel,
} from "./naming";

describe("humanizeIdentifier", () => {
  it("sentence-cases a separated identifier", () => {
    expect(humanizeIdentifier("code-reviewer")).toBe("Code reviewer");
    expect(humanizeIdentifier("release_manager")).toBe("Release manager");
    expect(humanizeIdentifier("agent.run")).toBe("Agent run");
  });

  it("splits camelCase humps", () => {
    expect(humanizeIdentifier("postMessage")).toBe("Post message");
    expect(humanizeIdentifier("createIssueComment")).toBe(
      "Create issue comment",
    );
  });

  it("upper-cases initialisms wherever they appear", () => {
    // "Pr reviewer" reads as a typo; "PR reviewer" reads as a role.
    expect(humanizeIdentifier("pr-reviewer")).toBe("PR reviewer");
    expect(humanizeIdentifier("sync-api-keys")).toBe("Sync API keys");
    expect(humanizeIdentifier("ai")).toBe("AI");
  });

  it("returns an identifier with no word characters verbatim", () => {
    expect(humanizeIdentifier("---")).toBe("---");
    expect(humanizeIdentifier("")).toBe("");
  });

  it("keeps an initialism upper-case in EVERY lead case — the table is the point", () => {
    // Lower-casing the humanized result (rather than asking for a lower lead) is
    // what turned "List API keys" into "list api keys".
    expect(humanizeIdentifier("listAPIKeys", "lower")).toBe("list API keys");
    expect(humanizeIdentifier("ci_run_completed", "lower")).toBe(
      "CI run completed",
    );
    expect(humanizeIdentifier("pull_request", "lower")).toBe("pull request");
    expect(humanizeIdentifier("google-sheets", "title")).toBe("Google Sheets");
    expect(humanizeIdentifier("microsoft-teams", "title")).toBe(
      "Microsoft Teams",
    );
  });

  it("splits a run of capitals from the word that follows it", () => {
    expect(humanizeIdentifier("listAPIKeys")).toBe("List API keys");
    expect(humanizeIdentifier("parseHTMLDocument")).toBe(
      "Parse HTML document",
    );
  });
});

describe("shortModel", () => {
  it("drops the vendor prefix, keeping the model", () => {
    expect(shortModel("anthropic/claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(shortModel("zai/glm-5")).toBe("glm-5");
  });

  it("passes through a slug that carries no vendor", () => {
    expect(shortModel("glm-5")).toBe("glm-5");
  });
});

describe("parseActionPath", () => {
  it("splits provider / resource / operation", () => {
    expect(parseActionPath("github.pulls.reviews.create")).toEqual({
      provider: "github",
      resource: "pulls.reviews",
      operation: "create",
    });
  });

  it("reports no resource for a two-segment path", () => {
    expect(parseActionPath("slack.postMessage")).toEqual({
      provider: "slack",
      operation: "postMessage",
      resource: undefined,
    });
  });

  it("returns null for a value that isn't a dotted path", () => {
    // A `${…}` expression or a bare word has no structure to invent.
    expect(parseActionPath("github")).toBeNull();
    expect(parseActionPath("${steps[0].path}")).toBeNull();
    expect(parseActionPath("")).toBeNull();
  });
});

describe("actionPathLabel", () => {
  it("reads as operation: resource — the provider names the node itself", () => {
    expect(actionPathLabel("github.pulls.reviews.create")).toBe(
      "create: pulls.reviews",
    );
    expect(actionPathLabel("github.issues.create")).toBe("create: issues");
  });

  it("humanizes a camelCase operation, without flattening an initialism", () => {
    expect(actionPathLabel("slack.postMessage")).toBe("post message");
    expect(actionPathLabel("stripe.customers.listAPIKeys")).toBe(
      "list API keys: customers",
    );
  });

  it("shows an unsplittable value verbatim rather than inventing structure", () => {
    expect(actionPathLabel("github")).toBe("github");
  });
});
