#!/usr/bin/env python3
"""Export a play's recorded check history as @tangle-network/charts inputs (docs/fixtures/magnetar-play.json).

Reads Discovery run directories read-only (play-checks.jsonl, tag-gate.jsonl, operator-checkpoints.jsonl,
run-input.json, scorecard.json, result.json, magnetar-metrics.json and each release's cached magnetar.json) and
writes the climb (`timeSeries` rows, ordinal categories, group bands, ruling and gap marks) and the bar panels
(`smallMultiples`). It makes no judgement the records do not state: the checker is the row's digest, or for a gate
the digest in force at its time; a value is comparable only when its release held the contract under its checker
and its manifest declares the bar's security precondition.

    python3 scripts/export-play-fixture.py /mnt/traces/discovery-runs magnetar-rust-20261017c magnetar-rust-20261018b \
        magnetar-rust-20261019b > docs/fixtures/magnetar-play.json
"""
import glob
import hashlib
import json
import os
import re
import statistics
import sys
from datetime import datetime, timezone

STAGES = ["manifest", "build", "guests", "keys", "workloads", "hidden"]
# plays/magnetar-rust/bar.json is not on master yet; these are the values the spec's data contract A5 records,
# from ePrint 2026/2423 Tables 2, 3 and 8.
BAR = {
    "source": "ePrint 2026/2423 Tables 2, 3 and 8: 2^22-cycle executions, 12 performance cores of an M4 Max, 120-bit",
    "check": "the check runs 2^12 = 4,096 cycles per workload, one jailed run on the Lab host",
    "precondition": 120,
}


def ms(iso):
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def utc(msv):
    return datetime.fromtimestamp(msv / 1000, timezone.utc).strftime("%m-%d %H:%MZ")


def jsonl(path):
    if not os.path.exists(path):
        return []
    return [json.loads(line) for line in open(path) if line.strip()]


def score_of(row):
    if row.get("score"):
        return row["score"]
    for line in (row.get("detail") or "").splitlines():
        if line.startswith("SCORE "):
            return json.loads(line[6:])
    return None


def verdict_line(row):
    for line in (row.get("detail") or "").splitlines():
        if line.startswith(("SOLVED", "NOT SOLVED", "UNKNOWN")):
            return line[:240]
    return (row.get("detail") or "").splitlines()[-1][:240] if row.get("detail") else ""


def progress(score, solved):
    if solved:
        return 1.0
    if not score:
        return None
    return round((score["reached"] - 1 + (score.get("partial") or 0)) / score["of"], 3)


def manifest_bits(row):
    m = re.search(r"cached at (\S+?)\)", row.get("detail") or "")
    if not m:
        return None
    for path in glob.glob(os.path.join(m.group(1), "src", "magnetar.json")):
        try:
            return json.load(open(path)).get("security_bits")
        except (OSError, ValueError):
            return None
    return None


def main(root, runs):
    columns, groups, rows_by_series, marks, bar_points = [], [], {}, [], {"rate": [], "proof": [], "verify": [], "rss": []}
    checker_order, digest_of_run = [], {}
    rulings_all = []
    for run in runs:
        d = os.path.join(root, run)
        ri = json.load(open(os.path.join(d, "run-input.json")))
        script = (((ri.get("acceptance") or {}).get("play") or {}).get("check") or {}).get("script")
        pressed = hashlib.sha256(script.encode()).hexdigest() if script else None
        digest_of_run[run] = pressed
        checks, gates = jsonl(os.path.join(d, "play-checks.jsonl")), jsonl(os.path.join(d, "tag-gate.jsonl"))
        ops = jsonl(os.path.join(d, "operator-checkpoints.jsonl"))
        new_digest = {o["dispute"]: o["newDigest"].split(":")[-1] for o in ops if o.get("kind") == "amendment-pr" and o.get("newDigest")}
        rulings = [o for o in ops if o.get("kind") == "ruler-amendment"]
        for row in checks:
            ck = (row.get("checker") or {}).get("sha256") if isinstance(row.get("checker"), dict) else None
            row["_checker"], row["_kind"] = ck, "check"
        # A gate row records no checker: it takes the digest in force at its time.
        in_force = [(0, pressed)]
        for r in rulings:
            if r.get("verdict") != "upheld":
                continue
            nd = new_digest.get(r["dispute"])
            if not nd:
                later = sorted((ms(c["at"]), c["_checker"]) for c in checks if c["_checker"] and ms(c["at"]) > ms(r["at"]))
                old = sorted((ms(c["at"]), c["_checker"]) for c in checks if c["_checker"] and ms(c["at"]) <= ms(r["at"]))
                nd = next((ck for _, ck in later if not old or ck != old[-1][1]), None)
            if nd:
                in_force.append((ms(r["at"]), nd))
        for row in gates:
            row["_checker"] = max((t, ck) for t, ck in in_force if t <= ms(row["at"]))[1]
            row["_kind"] = "gate"
        for ck in [pressed] + [c["_checker"] for c in sorted(checks, key=lambda c: c["at"])] + [ck for _, ck in in_force]:
            if ck and ck not in checker_order:
                checker_order.append(ck)
        recorded = [r for r in checks + gates if r.get("tag") and r.get("verdict") != "superseded"]
        tags = []
        for r in sorted(recorded, key=lambda r: r["at"]):
            t = r["tag"].split("/")[-1]
            if t not in tags:
                tags.append(t)
        superseded = sorted({g["tag"].split("/")[-1] for g in gates if g.get("verdict") == "superseded"} - set(tags))
        unscored = not any(score_of(r) for r in recorded)
        start = len(columns)
        for t in tags:
            rs = [r for r in recorded if r["tag"].split("/")[-1] == t]
            checkers = {r["_checker"] for r in rs}
            weight = 0.3 if unscored else (2.5 if len(checkers) > 2 else 1)
            columns.append({"run": run, "tag": t, "first": min(ms(r["at"]) for r in rs), "weight": weight, "rows": rs})
        if not tags:
            columns.append({"run": run, "tag": None, "first": None, "weight": 0.6, "rows": []})
        scorecard = json.load(open(os.path.join(d, "scorecard.json")))
        timing = scorecard.get("timing") or {}
        result = json.load(open(os.path.join(d, "result.json"))) if os.path.exists(os.path.join(d, "result.json")) else {}
        groups.append({"run": run, "from": start, "to": len(columns) - 1, "start": timing.get("start"), "settled": timing.get("settledAt"),
                       "ending": result.get("reason") or ("live" if not timing.get("settledAt") else "settled"),
                       "checked": len(tags), "unscored": unscored, "superseded": superseded,
                       "withheld": sorted({g["tag"].split("/")[-1] for g in gates if g.get("verdict") in ("fail", "unknown")} - {g["tag"].split("/")[-1] for g in gates if g.get("verdict") == "pass"}),
                       "rows": len(checks) + len(gates), "untagged": sum(1 for r in checks if not r.get("tag"))})
        for r in rulings:
            disputed = next((c for c in sorted(checks, key=lambda c: c["at"]) if c.get("tag") and verdict_line(c)[:80] == (r.get("line") or "")[:80]), None)
            rulings_all.append({"run": run, "ruling": r, "tag": disputed["tag"].split("/")[-1] if disputed else None,
                                "newDigest": new_digest.get(r["dispute"]) or next((ck for t, ck in in_force if t == ms(r["at"])), None)})
        metrics_path = os.path.join(d, "magnetar-metrics.json")
        if os.path.exists(metrics_path):
            mt = int(os.path.getmtime(metrics_path) * 1000)
            metrics = json.load(open(metrics_path))
            solved = [c for c in checks if c.get("solved")]
            near = min(solved, key=lambda c: abs(ms(c["at"]) - mt), default=None)
            if near and abs(ms(near["at"]) - mt) < 5 * 60_000:
                w = metrics["workloads"].values()
                rates = [x["rate_cps"] for x in w]
                bar_points["rate"].append({"tag": near["tag"].split("/")[-1], "run": run, "value": statistics.median(rates), "range": [min(rates), max(rates)],
                                           "rss": statistics.median(x["rss_kib"] for x in w), "bits": metrics.get("security_bits"), "at": ms(near["at"]), "workloads": len(rates)})
    # Checker labels: vN by first appearance across the play's runs; the newest run's pressed digest is current.
    label = {ck: f"v{i + 1}" for i, ck in enumerate(checker_order)}
    current = digest_of_run[runs[-1]]
    ordered_by_age = [current] + [ck for ck in reversed(checker_order) if ck != current]
    color = {ck: i for i, ck in enumerate(ordered_by_age)}
    origin = {}
    for g in runs:
        if digest_of_run[g] and digest_of_run[g] not in origin:
            origin[digest_of_run[g]] = f"{g[-3:]} as pressed"
    for r in rulings_all:
        if r["newDigest"] and r["newDigest"] not in origin:
            origin[r["newDigest"]] = f"{r['ruling']['by']} {r['ruling']['verdict']} {utc(ms(r['ruling']['at']))}"

    categories = []
    for i, c in enumerate(columns):
        c["at"] = i + 1
        categories.append({"at": i + 1, "label": c["tag"] or "no tags", "weight": c["weight"]})

    def series_key(run, ck, kind):
        return (run, ck, kind)

    for c in columns:
        agg = {}
        for r in sorted(c["rows"], key=lambda r: r["at"]):
            sc = score_of(r)
            if r["_kind"] == "gate":
                verdict = {"pass": "pass", "fail": "fail"}.get(r.get("verdict"), "unknown")
                solved = False
            else:
                verdict = "pass" if r.get("solved") else ("fail" if r.get("known") else "unknown")
                solved = bool(r.get("solved"))
            p = progress(sc, solved)
            if r["_kind"] == "gate" and verdict == "pass" and sc:
                p = progress(sc, False)
            wl = (sc or {}).get("workloads")
            key = (series_key(c["run"], r["_checker"], r["_kind"]), verdict, p)
            a = agg.setdefault(key, {"count": 0, "first": ms(r["at"]), "last": ms(r["at"]), "line": verdict_line(r), "score": sc, "wl": wl, "commit": r.get("commit"), "bits": manifest_bits(r)})
            a["count"] += 1
            a["last"] = ms(r["at"])
            a["line"] = verdict_line(r)
        for (skey, verdict, p), a in agg.items():
            sc = a["score"]
            point = {"x": c["at"], "y": p, "verdict": verdict, "count": a["count"], "firstAt": a["first"], "lastAt": a["last"]}
            if skey[2] == "gate":
                point["marker"] = "diamond"
            if verdict == "pass" and p == 1.0:
                point["glyph"] = "check"
            if sc and sc.get("stage") == "workloads" and a["wl"]:
                point["label"] = f"{a['wl']['passed']}/{a['wl']['total']}"
            stage = f"stage {sc['reached']} of {sc['of']} ({sc['stage']})" if sc else "no score line"
            point["annotation"] = f"{c['run'][-3:]} {c['tag']} @ {(a['commit'] or '')[:8]} · {stage} · {a['line']}"
            rows_by_series.setdefault(skey, []).append(point)
        # Against the bar: one value per column, from the gate row (contract scope), else the newest scored check row.
        scored = [r for r in c["rows"] if score_of(r) and score_of(r).get("proofBytes")]
        if scored:
            gate = [r for r in scored if r["_kind"] == "gate"]
            pick = (gate or sorted(scored, key=lambda r: r["at"]))[-1]
            sc, bits = score_of(pick), manifest_bits(pick)
            held = pick["_kind"] == "gate" and pick.get("verdict") == "pass"
            entry = {"tag": c["tag"], "x": c["at"], "proof": sc["proofBytes"], "verify": sc["verifyMs"], "held": held, "bits": bits,
                     "checker": label[pick["_checker"]], "commit": pick["commit"], "kind": pick["_kind"], "verdict": pick.get("verdict") or ("solved" if pick.get("solved") else "not solved")}
            bar_points["proof"].append(entry)

    rows = []
    for (run, ck, kind), points in rows_by_series.items():
        points.sort(key=lambda p: (p["x"], p["firstAt"]))
        rows.append({"id": f"{run}-{label[ck]}-{kind}", "label": f"{label[ck]} · {origin.get(ck, ck[:8])} · {run[-3:]} {kind}s", "colorIndex": color[ck], "points": points})
    rows.sort(key=lambda r: (min(p["firstAt"] for p in r["points"])))

    bands = []
    for g in groups:
        span = f"{utc(ms(g['start']))}–{utc(ms(g['settled'])) if g['settled'] else 'now'}" if g["start"] else ""
        parts = [g["run"][-3:], span, f"{g['checked']} tags checked"]
        if g["withheld"]:
            parts.append(f"{len(g['withheld'])} withheld")
        if g["superseded"]:
            parts.append(f"{len(g['superseded'])} superseded")
        if g["unscored"] and g["checked"]:
            parts.append("no score line")
        parts.append(g["ending"])
        bands.append({"from": g["from"] + 1, "to": g["to"] + 1, "label": " · ".join(p for p in parts if p), "kind": "group"})
    for prev, nxt in zip(columns, columns[1:]):
        if prev["run"] == nxt["run"] and prev["first"] and nxt["first"] and nxt["first"] - prev["first"] > 2 * 3_600_000:
            marks.append({"at": prev["at"] + 0.5, "label": f"{(nxt['first'] - prev['first']) / 3_600_000:.1f} h", "kind": "event", "source": "gap"})
    by_tag = {(c["run"], c["tag"]): c for c in columns}
    offsets = {}
    for r in rulings_all:
        col = by_tag.get((r["run"], r["tag"]))
        if not col:
            continue
        ruling = r["ruling"]
        n = offsets.setdefault(col["at"], 0)
        offsets[col["at"]] += 1
        effect = f"{label.get(r['newDigest'], '?')}" if ruling["verdict"] == "upheld" else "check stands"
        marks.append({"at": round(col["at"] - 0.32 + 0.22 * n, 3), "label": f"{effect} · {ruling['by']} {ruling['verdict']} {utc(ms(ruling['at']))}", "kind": "ruling"})

    def bar_point(e, value, kind):
        failing = e["kind"] == "gate" and not e["held"]
        comparable = None if e["bits"] is None else e["bits"] >= BAR["precondition"]
        p = {"x": e["x"], "y": value, "label": e["tag"],
             "annotation": f"{e['tag']} @ {e['commit'][:8]} · {e['kind']} {e['verdict']} under {e['checker']} · manifest security_bits {e['bits']}"}
        if failing:
            p.update({"verdict": "fail", "glyph": "cross"})
        else:
            p["comparable"] = comparable
        return p

    proof = [bar_point(e, round(e["proof"] / 1024, 2), "proof") for e in bar_points["proof"]]
    verify = [bar_point(e, e["verify"], "verify") for e in bar_points["proof"]]
    xs = {c["tag"]: c["at"] for c in columns}
    rate, rss = [], []
    for e in bar_points["rate"]:
        common = {"x": xs[e["tag"]], "label": e["tag"], "comparable": e["bits"] >= BAR["precondition"] if e["bits"] is not None else None}
        rate.append({**common, "y": e["value"], "annotation": f"median of {e['workloads']} workloads, range {e['range'][0]:,}–{e['range'][1]:,} c/s; recorded only on a solved check ({utc(e['at'])}); declared {e['bits']}-bit"})
        rss.append({**common, "y": round(e["rss"] / 1024, 2), "annotation": f"median peak RSS of {e['workloads']} workloads; declared {e['bits']}-bit"})
    panels = [
        {"id": "rate", "label": "Proving rate", "unit": "c/s", "scale": "log", "domain": [5e4, 2e7],
         "targets": [{"from": 7.2e6, "to": 8.7e6, "label": "paper 7.2–8.7 M", "kind": "target"}, {"from": 9.5e6, "to": 1.28e7, "label": "opt 9.5–12.8 M", "kind": "stretch"}], "points": rate},
        {"id": "proof", "label": "Proof size", "unit": "KiB", "scale": "log", "domain": [5, 2000],
         "targets": [{"from": 599, "to": 599, "label": "paper ≈599 KiB", "kind": "target"}], "points": proof},
        {"id": "verify", "label": "Verify time", "unit": "ms", "scale": "log", "domain": [5, 1000],
         "targets": [{"from": 11, "to": 13, "label": "paper 11–13 ms", "kind": "target"}, {"from": 8, "to": 11, "label": "opt 8–11", "kind": "stretch"}], "points": verify},
        {"id": "rss", "label": "Peak RSS", "unit": "MiB", "scale": "log", "domain": [1, 10000],
         "targets": [{"from": 6144, "to": 6144, "label": "paper ≈6 GiB", "kind": "target"}, {"from": 4096, "to": 4096, "label": "opt 4 GiB", "kind": "stretch"}], "points": rss},
    ]
    ticks = [{"at": round(i / 6, 4), "label": s} for i, s in enumerate(STAGES)] + [{"at": 1, "label": "SOLVED"}]
    checkers = [{"label": label[ck], "sha256": ck[:8], "origin": origin.get(ck), "colorIndex": color[ck], "current": ck == current} for ck in checker_order]
    out = {
        "source": {"root": root, "runs": runs, "files": ["play-checks.jsonl", "tag-gate.jsonl", "operator-checkpoints.jsonl", "run-input.json", "scorecard.json", "result.json", "magnetar-metrics.json", "release magnetar.json (check cache)"],
                   "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "bar": BAR},
        "checkers": checkers,
        "climb": {"categories": categories, "rows": rows, "marks": marks, "bands": bands, "ticks": ticks},
        "bar": {"panels": [p for p in panels if p["points"]], "missing": [p["id"] for p in panels if not p["points"]]},
    }
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
