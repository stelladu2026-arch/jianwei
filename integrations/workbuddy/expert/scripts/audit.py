#!/usr/bin/env python3
"""Local structural/quote audit. No network, no model, no semantic fact checking."""
import argparse
import datetime
import hashlib
import html
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

MAX_BYTES = 2_000_000
VERDICTS = {"supported", "partial", "contradicted", "unknown"}

class AuditError(ValueError):
    pass

def require(ok, message):
    if not ok:
        raise AuditError(message)

def text(value):
    return isinstance(value, str) and bool(value.strip())

def nonempty(value, field):
    require(text(value), field + ": nonempty text required")

def bounded_list(value, limit, field, minimum=0):
    require(isinstance(value, list) and minimum <= len(value) <= limit,
            field + ": invalid list length")
    return value

def obj(value, field):
    require(isinstance(value, dict), field + ": object required")
    return value

def integer(value):
    return isinstance(value, int) and not isinstance(value, bool)

def audit(record):
    obj(record, "record")
    require(record.get("schema_version") == "jianwei-research/1", "unsupported schema")
    scope = obj(record.get("scope"), "scope")
    for key in ("audience", "scenario", "region", "decision"):
        nonempty(scope.get(key), "scope." + key)
    require(type(scope.get("confirmed")) is bool, "scope.confirmed must be boolean")
    for a in bounded_list(scope.get("assumptions"), 20, "scope.assumptions"):
        nonempty(a, "assumption")
    sources = {}
    for s in bounded_list(record.get("sources"), 30, "sources"):
        obj(s, "source")
        for key in ("id", "title", "version", "independence_key"):
            nonempty(s.get(key), "source." + key)
        require(s["id"] not in sources, "duplicate source id")
        require(s.get("kind") in {"web", "user", "synthetic"}, "invalid source kind")
        require(s.get("body_status") in {"full", "excerpt", "unavailable"}, "invalid body status")
        require(isinstance(s.get("body"), str) and len(s["body"]) <= 60000, "invalid source body")
        require((s["body_status"] == "unavailable") == (not bool(s["body"].strip())),
                "body status conflicts with body")
        nonempty(s.get("retrieved_at"), "source.retrieved_at")
        try:
            stamp = datetime.datetime.fromisoformat(s["retrieved_at"].replace("Z", "+00:00"))
            require(stamp.utcoffset() is not None, "retrieved_at needs timezone")
        except (ValueError, TypeError) as exc:
            raise AuditError("invalid source time") from exc
        if s["kind"] == "web":
            u = urlparse(s.get("url") or "")
            require(u.scheme == "https" and bool(u.hostname) and not u.username and not u.password,
                    "web source needs credential-free https URL")
        else:
            require(s.get("url") is None, "non-web source URL must be null")
        sources[s["id"]] = s
    results = []
    seen_claims, seen_clauses = set(), set()
    for claim in bounded_list(record.get("claims"), 20, "claims", 1):
        obj(claim, "claim")
        for key in ("id", "text"):
            nonempty(claim.get(key), "claim." + key)
        require(len(claim["text"]) <= 8000, "claim too long")
        require(claim["id"] not in seen_claims, "duplicate claim id")
        seen_claims.add(claim["id"])
        require(type(claim.get("scope_confirmed")) is bool and
                claim["scope_confirmed"] == scope["confirmed"], "claim scope mismatch")
        cursor, verdicts, source_ids = 0, [], set()
        for clause in bounded_list(claim.get("clauses"), 12, "clauses", 1):
            obj(clause, "clause")
            for key in ("id", "text", "reason"):
                nonempty(clause.get(key), "clause." + key)
            require(clause["id"] not in seen_clauses, "duplicate clause id")
            seen_clauses.add(clause["id"])
            start, end = clause.get("start"), clause.get("end")
            require(integer(start) and integer(end) and start == cursor and end > start and
                    end <= len(claim["text"]) and claim["text"][start:end] == clause["text"],
                    "clause gap, overlap or text mismatch")
            cursor = end
            verdict = clause.get("verdict")
            require(verdict in VERDICTS, "invalid verdict")
            anchors = bounded_list(clause.get("anchors"), 3, "anchors")
            require(verdict == "unknown" or bool(anchors), "non-unknown verdict needs quote")
            for anchor in anchors:
                obj(anchor, "anchor")
                source_id = anchor.get("source_id")
                require(isinstance(source_id, str) and source_id in sources, "unknown source")
                source = sources[source_id]
                require(anchor.get("source_version") == source["version"], "source version mismatch")
                require(source["body_status"] != "unavailable", "unavailable source cited")
                nonempty(anchor.get("quote"), "quote")
                a, b = anchor.get("start"), anchor.get("end")
                require(integer(a) and integer(b) and 0 <= a < b <= len(source["body"]) and
                        source["body"][a:b] == anchor["quote"], "quote offset/text mismatch")
                if source["kind"] == "synthetic":
                    require(verdict == "unknown", "synthetic material cannot support market claim")
                source_ids.add(source_id)
            verdicts.append(verdict)
        require(cursor == len(claim["text"]), "claim not fully covered")
        aggregate = ("supported" if all(v == "supported" for v in verdicts)
                     else "contradicted" if "contradicted" in verdicts
                     else "partial" if any(v in {"supported", "partial"} for v in verdicts)
                     else "unknown")
        results.append({"id": claim["id"], "status": aggregate,
                        "source_ids": sorted(source_ids), "clause_count": len(verdicts)})
    rec = obj(record.get("recommendation"), "recommendation")
    require(rec.get("action") in {"evidence_needed", "validate", "stop"}, "invalid recommendation")
    nonempty(rec.get("rationale"), "recommendation.rationale")
    real_bodies = [s for s in sources.values() if s["kind"] != "synthetic" and
                   s["body_status"] != "unavailable"]
    if not scope["confirmed"] or not real_bodies:
        require(rec["action"] == "evidence_needed", "unconfirmed/sourceless scope cannot decide")
    plan = obj(record.get("validation_plan"), "validation_plan")
    for key in ("audience", "success_signal", "stop_condition", "time_budget", "cost_budget"):
        nonempty(plan.get(key), "validation_plan." + key)
    for question in bounded_list(plan.get("questions"), 5, "questions", 1):
        nonempty(question, "question")
    requests = bounded_list(record.get("request_log"), 30, "request_log")
    request_ids = set()
    for request in requests:
        obj(request, "request")
        for key in ("id", "tool", "purpose"):
            nonempty(request.get(key), "request." + key)
        require(request["id"] not in request_ids, "duplicate request id")
        request_ids.add(request["id"])
        require(request.get("status") in {"success", "failed", "timeout", "unavailable"},
                "invalid request status")
    return {"structural_check": "passed", "semantic_check": "pending_human_review",
            "model_usage": "not_measured_by_local_audit",
            "claims": results,
            "source_groups": len({s["independence_key"] for s in real_bodies}),
            "attempted_requests": sum(r["status"] != "unavailable" for r in requests),
            "note": "Group counts are provenance groups, not verified customers."}

def render(record, result):
    def safe(value):
        return html.escape(str(value), quote=False).replace("|", "&#124;").replace("\n", " ")
    lines = ["# 见微 · 产品机会研究草稿", "",
             "> 机械结构与引文定位检查通过；模型语义判断待人工核查。", "",
             "## 建议", "", safe(record["recommendation"]["action"]) + "："
             + safe(record["recommendation"]["rationale"]), "",
             "## 范围", ""]
    for key in ("audience", "scenario", "region", "decision", "confirmed", "assumptions"):
        lines.append("- " + key + "：" + safe(record["scope"][key]))
    lines += ["", "## 主张与证据", ""]
    source_map = {s["id"]: s for s in record["sources"]}
    for claim, checked in zip(record["claims"], result["claims"]):
        lines += ["### " + safe(claim["id"]), "", safe(claim["text"]), "",
                  "汇总：" + checked["status"] + "（模型判断）", ""]
        for clause in claim["clauses"]:
            lines += ["- " + safe(clause["id"]) + "：" + safe(clause["text"]),
                      "  - 判断：" + clause["verdict"] + "；" + safe(clause["reason"])]
            for anchor in clause["anchors"]:
                source = source_map[anchor["source_id"]]
                lines += ["  - 逐字引文：" + safe(anchor["quote"]),
                          "  - 来源：" + safe(source["id"]) + " / " + safe(source["title"]) +
                          " / " + safe(source["version"]) + " / " + safe(source["url"] or "用户文件或虚构样例")]
    lines += ["", "## 最小验证计划", ""]
    for key, value in record["validation_plan"].items():
        lines.append("- " + key + "：" + safe(value))
    lines += ["", "## 读取与执行记录", ""]
    for source in record["sources"]:
        lines.append("- " + safe(source["id"]) + "：" + safe(source["body_status"]) +
                     "；" + safe(source["retrieved_at"]) + "；" + safe(source["kind"]))
    for request in record["request_log"]:
        lines.append("- " + safe(request["id"]) + "：" + safe(request["tool"]) +
                     "；" + safe(request["purpose"]) + "；" + safe(request["status"]))
    lines += ["", "## 费用与限制", "", "专家免费安装；模型消耗按用户自己的WorkBuddy账号、模型及平台规则处理。",
              "本地核查不读取平台积分或账单，不据此估算本次费用；没有作者模型服务兜底。",
              "来源分组不代表独立客户数；本报告不证明商业价值。",
              "范围外推、因果、版本适用性和反证仍需逐项人工确认；没有自动核实用户数或付费意愿。", ""]
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    try:
        with args.record.open("rb") as stream:
            raw = stream.read(MAX_BYTES + 1)
        require(len(raw) <= MAX_BYTES, "record exceeds 2 MB")
        record = json.loads(raw)
        result = audit(record)
        result["input_sha256"] = hashlib.sha256(raw).hexdigest()
        if args.output_dir:
            # A fresh directory prevents accidental overwrite of past reports.
            args.output_dir.mkdir(parents=False, exist_ok=False)
            for name, content in (
                ("audit-results.json", json.dumps(result, ensure_ascii=False, indent=2) + "\n"),
                ("report.md", render(record, result)),
            ):
                with (args.output_dir / name).open("x", encoding="utf-8") as stream:
                    stream.write(content)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (AuditError, ValueError, TypeError, KeyError, OSError) as exc:
        print(json.dumps({"structural_check": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
