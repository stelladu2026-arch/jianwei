#!/usr/bin/env python3
"""Build a self-contained WorkBuddy expert ZIP; no network or model calls."""
import argparse
import ast
import binascii
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT / "expert"
TEXT_FILES = [
    ".codebuddy-plugin/plugin.json", "agents/jianwei-research.md", "README.md",
    "references/record-format.md", "templates/report.md", "scripts/audit.py",
    "references/runtime-policy.json",
]
NAME = "dusihui-jianwei-research-free"
RUNTIME_POLICY = {
    "schema_version": "jianwei-runtime/1", "edition": "free",
    "asset_distribution": "free_install",
    "model_execution": "workbuddy_user_session",
    "model_billing": "workbuddy_user_account", "usage_metering": "platform_only",
    "author_model_fallback": False, "author_search_fallback": False,
    "author_database": False, "requires_own_registration": False,
    "custom_paid_unlock": False, "provider_connections": [],
    "quota_exhausted_action": "stop_and_preserve",
    "tool_unavailable_action": "analyze_available_material",
    "balance_unknown_action": "do_not_estimate",
    "research_plan": {"search_attempts": 3, "body_read_attempts": 6,
                      "enforcement": "agent_plan_not_account_quota"},
    "local_helpers": ["scripts/audit.py"],
}
MANIFEST_FIELDS = {
    "name", "version", "description", "author", "agents", "expertType", "agentName",
    "displayName", "profession", "displayDescription", "avatar", "categoryId",
    "defaultInitPrompt", "plugin", "tags", "quickPrompts",
}

def validate_execution_boundary(contents):
    """Build-time regression guard, not a sandbox for arbitrary Python."""
    errors = []
    expected = set(TEXT_FILES) | {"avatars/expert.png"}
    if set(contents) != expected:
        errors.append("free package file allowlist mismatch")
    try:
        policy = json.loads(contents.get("references/runtime-policy.json", b""))
        # JSON comparison preserves scalar types: false must not silently become 0.
        if json.dumps(policy, sort_keys=True) != json.dumps(RUNTIME_POLICY, sort_keys=True):
            errors.append("free runtime policy changed: platform user billing required")
    except (ValueError, TypeError, UnicodeError):
        errors.append("runtime policy missing or invalid")
    allowed_imports = {"argparse", "datetime", "hashlib", "html", "json", "pathlib", "sys", "urllib.parse"}
    blocked_calls = {"eval", "exec", "compile", "__import__", "getattr", "globals", "locals", "vars", "breakpoint"}
    try:
        tree = ast.parse(contents.get("scripts/audit.py", b""))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                if any(alias.name not in allowed_imports for alias in node.names):
                    errors.append("local audit imports external execution/network capability")
            elif isinstance(node, ast.ImportFrom):
                if node.level or node.module not in allowed_imports:
                    errors.append("local audit imports external execution/network capability")
                elif node.module == "urllib.parse" and any(alias.name != "urlparse" for alias in node.names):
                    errors.append("only URL parsing is allowed")
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in blocked_calls:
                errors.append("dynamic execution is not allowed in local audit")
            elif isinstance(node, ast.Attribute) and node.attr.startswith("__"):
                errors.append("runtime introspection is not allowed in local audit")
        if not tree.body:
            errors.append("local audit helper is empty")
    except (SyntaxError, ValueError, TypeError, UnicodeError):
        errors.append("local audit helper is invalid Python")
    return errors

def avatar():
    # Original geometric illustration: researcher, notebook and magnifying glass.
    w = h = 512
    pixels = bytearray(bytes.fromhex("edf3f4") * w * h)
    def shape(test, box, color):
        rgb = bytes.fromhex(color)
        x0, y0, x1, y1 = box
        for y in range(max(0, y0), min(h, y1)):
            for x in range(max(0, x0), min(w, x1)):
                if test(x, y):
                    p = (y * w + x) * 3
                    pixels[p:p+3] = rgb
    def ellipse(cx, cy, rx, ry, color):
        shape(lambda x,y: ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1,
              (cx-rx, cy-ry, cx+rx+1, cy+ry+1), color)
    def rect(x0, y0, x1, y1, color):
        shape(lambda x,y: True, (x0,y0,x1,y1), color)
    ellipse(256,256,222,222,"d9e7e8")
    ellipse(262,439,160,143,"173e50")
    rect(232,256,283,318,"d69a7a")
    ellipse(256,201,88,106,"243c49")
    ellipse(256,217,73,88,"eebc9c")
    ellipse(224,185,54,28,"243c49")
    ellipse(281,172,47,40,"243c49")
    ellipse(230,220,5,6,"243c49")
    ellipse(282,220,5,6,"243c49")
    rect(240,252,271,256,"ad745f")
    rect(125,341,275,443,"faf7ee")
    rect(132,350,198,433,"e9ded0")
    rect(202,350,268,433,"fffaf1")
    for y in (369,386,403):
        rect(143,y,188,y+4,"89a5a8")
        rect(213,y,257,y+4,"89a5a8")
    shape(lambda x,y: abs((y-326)-(x-326)*1.15) < 12,
          (311,310,411,426),"b67a49")
    ellipse(314,300,59,59,"173e50")
    ellipse(314,300,46,46,"f3eee2")
    ellipse(314,300,37,37,"d4e9e7")
    shape(lambda x,y: abs((x-300)+(y-280)) < 4,
          (288,269,322,303),"ffffff")
    raw = b"".join(b"\x00" + pixels[y*w*3:(y+1)*w*3] for y in range(h))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind+data)&0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB",w,h,8,2,0,0,0)) + chunk(b"IDAT",zlib.compress(raw,9)) + chunk(b"IEND",b"")

def valid_email(value):
    return bool(isinstance(value, str) and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value)
                and not re.search(r"example\.|replace|placeholder", value, re.I))

def validate(manifest, contents, release=False):
    errors, warnings = [], []
    errors.extend(validate_execution_boundary(contents))
    if set(manifest) - MANIFEST_FIELDS:
        errors.append("free expert cannot declare providers, MCP, billing hooks or other extra configuration")
    for key in ("name","version","description","author","agents","expertType","agentName",
                "displayName","profession","displayDescription","avatar","categoryId",
                "defaultInitPrompt","plugin","tags","quickPrompts"):
        if key not in manifest:
            errors.append("missing " + key)
    if errors:
        return errors, warnings
    if manifest["name"] != NAME or manifest["plugin"] != NAME:
        errors.append("name/plugin mismatch")
    if manifest["expertType"] != "agent" or manifest["agentName"] != "jianwei-research":
        errors.append("expert type/name mismatch")
    if not re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]):
        errors.append("invalid version")
    for key in ("displayName","profession","displayDescription","defaultInitPrompt"):
        if not isinstance(manifest[key], dict) or any(not str(manifest[key].get(lang,"")).strip() for lang in ("zh","en")):
            errors.append("missing localized text " + key)
    desc = manifest["displayDescription"].get("zh","")
    han_count = len(re.findall(r"[\u4e00-\u9fff]", desc))
    if not 40 <= len(desc) <= 50 or not 40 <= han_count <= 50:
        errors.append("Chinese description must be 40–50 characters, including Han-only count")
    for key in ("tags","quickPrompts"):
        if len(manifest[key]) != 3 or any(not item.get("zh") or not item.get("en") for item in manifest[key]):
            errors.append(key + " requires exactly three bilingual items")
    if manifest["defaultInitPrompt"] != manifest["quickPrompts"][0]:
        errors.append("default prompt mismatch")
    if not manifest["author"].get("name"):
        errors.append("author name missing")
    if set(manifest["author"]) != {"name", "email"}:
        errors.append("author metadata cannot contain provider configuration or secrets")
    if not valid_email(manifest["author"].get("email")):
        (errors if release else warnings).append("Public author email required before platform upload")
    if manifest["agents"] != ["./agents/jianwei-research.md"] or manifest["avatar"] != "avatars/expert.png":
        errors.append("unexpected package path")
    if manifest["categoryId"] != "01-ProductDesign":
        errors.append("unexpected category")
    if "tools" in manifest:
        errors.append("tool permissions must not be declared")
    for path in TEXT_FILES + ["avatars/expert.png"]:
        if path not in contents:
            errors.append("missing file " + path)
    agent = contents.get("agents/jianwei-research.md", b"").decode("utf-8")
    if not agent.startswith("---\n") or "\n---\n" not in agent[4:]:
        errors.append("agent frontmatter missing")
    else:
        front = agent.split("\n---\n",1)[0]
        fields = set(re.findall(r"^([A-Za-z][A-Za-z0-9_-]*)\s*:", front, re.M))
        if fields - {"name", "description", "displayName", "profession", "maxTurns"}:
            errors.append("free agent frontmatter contains unsupported runtime configuration")
        for token in ("name: jianwei-research","description:","displayName:","profession:","  en:","  zh:"):
            if token not in front:
                errors.append("frontmatter missing " + token)
        if re.search(r"^tools\s*:", front, re.M):
            errors.append("agent cannot declare tools")
    png = contents.get("avatars/expert.png",b"")
    if not (len(png) <= 500*1024 and png.startswith(b"\x89PNG\r\n\x1a\n") and png[16:24] == struct.pack(">II",512,512)):
        errors.append("avatar must be 512x512 PNG under 500KB")
    for path in contents:
        if path.startswith("/") or ".." in Path(path).parts or "\\" in path:
            errors.append("unsafe archive path")
        if len(Path(path).parts) > 2:
            errors.append("unexpected nesting " + path)
    return errors, warnings

def build(output, release=False, author_email=None, author_name=None):
    contents = {}
    for name in TEXT_FILES:
        path = PACKAGE / name
        if path.is_symlink() or not path.resolve().is_relative_to(PACKAGE.resolve()):
            raise ValueError("symlinks or files outside expert package are not packaged")
        contents[name] = path.read_bytes()
    manifest = json.loads(contents[".codebuddy-plugin/plugin.json"])
    if author_email is not None:
        manifest["author"]["email"] = author_email
    if author_name is not None:
        manifest["author"]["name"] = author_name
    contents[".codebuddy-plugin/plugin.json"] = (json.dumps(manifest,ensure_ascii=False,indent=2)+"\n").encode()
    contents["avatars/expert.png"] = avatar()
    errors, warnings = validate(manifest, contents, release)
    if errors:
        raise ValueError("; ".join(errors))
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(contents):
                info = zipfile.ZipInfo(name, date_time=(2026,11,6,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, contents[name])
    with zipfile.ZipFile(output) as archive:
        if set(archive.namelist()) != set(contents) or archive.testzip() is not None:
            raise ValueError("archive roundtrip failed")
        for name in contents:
            if archive.read(name) != contents[name]:
                raise ValueError("archive content mismatch")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    result = {"package": output.name, "sha256":digest, "file_count":len(contents),
              "structural_checks":"passed", "market_metadata":"passed" if not warnings else "blocked",
              "execution_boundary":"platform_user_only",
              "marketplace_free_selection":"requires_platform_configuration",
              "platform_install":"not_run", "live_tools":"not_run", "semantic_evaluation":"not_run",
              "warnings":warnings}
    output.with_suffix(".checks.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    output.with_suffix(".sha256").write_text(digest+"  "+output.name+"\n",encoding="utf-8")
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--release", action="store_true")
    p.add_argument("--author-email")
    p.add_argument("--author-name")
    a = p.parse_args()
    try:
        print(json.dumps(build(a.output,a.release,a.author_email,a.author_name),ensure_ascii=False))
    except (OSError,ValueError,KeyError,TypeError) as exc:
        p.exit(2,str(exc)+"\n")

if __name__ == "__main__":
    main()
