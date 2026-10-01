/** Model and harness marks supplied explicitly by the consumer. */
export interface RateIdentity {
  model?: { label: string; src: string };
  harness?: { label: string; src: string };
}

export function identityGap(rows: readonly { id: string }[], identities: Readonly<Record<string, RateIdentity>> | undefined): string | null {
  if (!identities) return null;
  for (const [id, identity] of Object.entries(identities)) {
    if (!rows.some((row) => row.id === id)) return `Identity names unknown setup ${id}.`;
    if (!identity || typeof identity !== "object") return `Invalid display identity for ${id}.`;
    for (const mark of [identity.model, identity.harness]) {
      if (!mark) continue;
      if (typeof mark.label !== "string" || !mark.label.trim() || typeof mark.src !== "string") return `Invalid display identity for ${id}.`;
      // Same-origin assets and HTTPS images only; protocol-relative URLs are not local assets.
      const local = /^\/(?!\/)[^\s<>"']+$/.test(mark.src);
      const https = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s<>"']*$/i.test(mark.src);
      if (!local && !https) return `Invalid identity image for ${id}.`;
    }
  }
  return null;
}

