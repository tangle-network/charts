/**
 * The one ELK (Eclipse Layout Kernel) instance a page shares. Its own module so
 * a canvas that only needs the layouter (`AgentGraph`) does not pull the
 * workflow model in with it.
 *
 * `elkjs` is an OPTIONAL peer, imported at call time.
 */

import type { ELK } from "elkjs/lib/elk-api";

/** One ELK instance per page. `null` once loading failed, so a host without
 *  the peer pays for one failed import, not one per render. */
let elkInstance: Promise<ELK | null> | undefined;

export function loadElk(): Promise<ELK | null> {
  elkInstance ??= import("elkjs/lib/elk.bundled.js")
    .then((mod) => {
      const Elk = (mod as { default: new () => ELK }).default;
      return new Elk();
    })
    .catch(() => null);
  return elkInstance;
}
