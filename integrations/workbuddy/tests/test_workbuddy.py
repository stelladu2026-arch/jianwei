import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
def module(name,path):
    spec = importlib.util.spec_from_file_location(name,path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
audit = module("audit", ROOT/"expert/scripts/audit.py")
package = module("package", ROOT/"package.py")

def fixture():
    body = "老师每周手工整理两次作业。平台已经支持批量收作业。"
    phrase = "老师每周手工整理两次作业。"
    return {
        "schema_version":"jianwei-research/1",
        "scope":{"audience":"教师","scenario":"作业整理","region":"未知",
                 "decision":"是否值得访谈","confirmed":True,"assumptions":[]},
        "sources":[{"id":"S1","title":"虚构测试文件","kind":"user","url":None,
                    "retrieved_at":"2026-11-06T09:00:00+08:00","version":"v1",
                    "body_status":"full","body":body,"independence_key":"thread-1"}],
        "claims":[{"id":"C1","text":phrase,"scope_confirmed":True,
                   "clauses":[{"id":"C1.1","text":phrase,"start":0,"end":len(phrase),
                               "verdict":"supported","reason":"仅支持这位教师自述，需人工核查",
                               "anchors":[{"source_id":"S1","source_version":"v1","quote":phrase,
                                           "start":0,"end":len(phrase)}]}]}],
        "recommendation":{"action":"validate","rationale":"仅建议访谈，不是市场结论"},
        "validation_plan":{"audience":"教师","questions":["目前怎样整理作业？"],
                           "success_signal":"拟定阈值：先访谈3人，未验证","stop_condition":"已有替代足够则停",
                           "time_budget":"一周","cost_budget":"零新增付费"},
        "request_log":[]
    }

class AuditTests(unittest.TestCase):
    def test_exact_quote_passes_but_semantics_remains_pending(self):
        result=audit.audit(fixture())
        self.assertEqual(result["claims"][0]["status"],"supported")
        self.assertEqual(result["semantic_check"],"pending_human_review")

    def test_wrong_quote_fails(self):
        r=fixture();r["claims"][0]["clauses"][0]["anchors"][0]["quote"]="改写"
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_stale_source_fails(self):
        r=fixture();r["sources"][0]["version"]="v2"
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_unknown_source_fails(self):
        r=fixture();r["claims"][0]["clauses"][0]["anchors"][0]["source_id"]="S9"
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_partial_support_does_not_promote_whole_claim(self):
        r=fixture();claim=r["claims"][0];clause=claim["clauses"][0]
        suffix="全行业都需要。";start=len(claim["text"]);claim["text"]+=suffix
        claim["clauses"].append({"id":"C1.2","text":suffix,"start":start,"end":len(claim["text"]),
                                "verdict":"unknown","reason":"没有行业依据","anchors":[]})
        self.assertEqual(audit.audit(r)["claims"][0]["status"],"partial")

    def test_uncovered_claim_fails(self):
        r=fixture();r["claims"][0]["text"]+="另一个事实"
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_missing_clause_fails(self):
        r=fixture();r["claims"][0]["clauses"]=[]
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_boolean_offset_fails(self):
        r=fixture();r["claims"][0]["clauses"][0]["start"]=False
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_source_without_body_cannot_support(self):
        r=fixture();r["sources"][0].update(body_status="unavailable",body="")
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_synthetic_cannot_support_market(self):
        r=fixture();r["sources"][0]["kind"]="synthetic"
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_unconfirmed_scope_cannot_validate(self):
        r=fixture();r["scope"]["confirmed"]=False;r["claims"][0]["scope_confirmed"]=False
        with self.assertRaises(audit.AuditError):audit.audit(r)

    def test_duplicate_thread_counts_one_provenance_group(self):
        r=fixture();s=copy.deepcopy(r["sources"][0]);s["id"]="S2";r["sources"].append(s)
        self.assertEqual(audit.audit(r)["source_groups"],1)

    def test_failed_and_timeout_requests_are_attempts(self):
        r=fixture();r["request_log"]=[{"id":str(i),"tool":"fetch","purpose":"正文",
            "status":s} for i,s in enumerate(["failed","timeout","unavailable"])]
        self.assertEqual(audit.audit(r)["attempted_requests"],2)

    def test_injected_html_is_data_not_report_markup(self):
        r=fixture();r["sources"][0]["title"]="<script>alert(1)</script>"
        report=audit.render(r,audit.audit(r))
        self.assertNotIn("<script>",report);self.assertIn("&lt;script&gt;",report)

    def test_evidence_needed_with_no_sources(self):
        r=fixture();r["sources"]=[]
        c=r["claims"][0]["clauses"][0];c.update(verdict="unknown",anchors=[],reason="缺正文")
        r["recommendation"]["action"]="evidence_needed"
        self.assertEqual(audit.audit(r)["claims"][0]["status"],"unknown")

    def test_cli_preserves_existing_output(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);record=root/"record.json";record.write_text(json.dumps(fixture()),encoding="utf-8")
            out=root/"result"
            cmd=[sys.executable,str(ROOT/"expert/scripts/audit.py"),str(record),"--output-dir",str(out)]
            self.assertEqual(subprocess.run(cmd,capture_output=True).returncode,0)
            before=(out/"report.md").read_bytes()
            self.assertEqual(subprocess.run(cmd,capture_output=True).returncode,2)
            self.assertEqual((out/"report.md").read_bytes(),before)

class PackageTests(unittest.TestCase):
    def contents(self):
        contents={n:(ROOT/"expert"/n).read_bytes() for n in package.TEXT_FILES}
        contents["avatars/expert.png"]=package.avatar()
        return contents

    def test_free_policy_bills_platform_user_only(self):
        contents=self.contents()
        self.assertEqual(package.validate_execution_boundary(contents),[])
        m=json.loads(contents[".codebuddy-plugin/plugin.json"])
        self.assertEqual(m["name"],"dusihui-jianwei-research-free")
        self.assertEqual(m["plugin"],m["name"])

    def test_author_model_fallback_is_rejected(self):
        contents=self.contents();p=json.loads(contents["references/runtime-policy.json"])
        p["author_model_fallback"]=True
        contents["references/runtime-policy.json"]=json.dumps(p).encode()
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_author_billing_route_is_rejected(self):
        contents=self.contents();p=json.loads(contents["references/runtime-policy.json"])
        p["model_billing"]="author_account"
        contents["references/runtime-policy.json"]=json.dumps(p).encode()
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_own_signup_or_paid_unlock_is_rejected(self):
        for field in ("requires_own_registration","custom_paid_unlock","author_search_fallback","author_database"):
            with self.subTest(field=field):
                contents=self.contents();p=json.loads(contents["references/runtime-policy.json"])
                p[field]=True;contents["references/runtime-policy.json"]=json.dumps(p).encode()
                self.assertTrue(package.validate_execution_boundary(contents))

    def test_policy_boolean_cannot_be_replaced_by_zero(self):
        contents=self.contents();p=json.loads(contents["references/runtime-policy.json"])
        p["author_model_fallback"]=0
        contents["references/runtime-policy.json"]=json.dumps(p).encode()
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_missing_policy_is_rejected(self):
        contents=self.contents();del contents["references/runtime-policy.json"]
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_extra_secret_or_mcp_file_is_rejected(self):
        for name in (".env",".mcp.json","scripts/provider.py"):
            with self.subTest(name=name):
                contents=self.contents();contents[name]=b"synthetic fixture only"
                self.assertTrue(package.validate_execution_boundary(contents))

    def test_provider_configuration_in_manifest_is_rejected(self):
        contents=self.contents();m=json.loads(contents[".codebuddy-plugin/plugin.json"])
        m["dependencies"]={"mcpServers":"./.mcp.json"}
        errors,_=package.validate(m,contents)
        self.assertTrue(any("extra configuration" in e for e in errors))

    def test_provider_configuration_hidden_in_author_is_rejected(self):
        contents=self.contents();m=json.loads(contents[".codebuddy-plugin/plugin.json"])
        m["author"]["api_key"]="synthetic-not-a-key"
        errors,_=package.validate(m,contents)
        self.assertTrue(any("author metadata" in e for e in errors))

    def test_agent_frontmatter_cannot_add_provider(self):
        contents=self.contents();m=json.loads(contents[".codebuddy-plugin/plugin.json"])
        name="agents/jianwei-research.md"
        contents[name]=contents[name].replace(b"maxTurns: 30",b"maxTurns: 30\nprovider: external-test")
        errors,_=package.validate(m,contents)
        self.assertTrue(any("unsupported runtime" in e for e in errors))

    def test_network_capability_in_local_helper_is_rejected(self):
        contents=self.contents();contents["scripts/audit.py"]+=b"\nimport urllib.request\n"
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_environment_secret_access_is_rejected(self):
        contents=self.contents();contents["scripts/audit.py"]+=b"\nimport os\nkey=os.environ.get('SYNTHETIC_TEST_KEY')\n"
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_dynamic_import_is_rejected(self):
        contents=self.contents();contents["scripts/audit.py"]+=b"\n__import__('urllib.request')\n"
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_invalid_local_helper_is_rejected(self):
        contents=self.contents();contents["scripts/audit.py"]=b"not valid Python !"
        self.assertTrue(package.validate_execution_boundary(contents))

    def test_review_zip_contains_hidden_root_and_flags_release_blocker(self):
        with tempfile.TemporaryDirectory() as td:
            dest=Path(td)/"review.zip";result=package.build(dest,author_email="")
            self.assertEqual(result["market_metadata"],"blocked")
            self.assertEqual(result["execution_boundary"],"platform_user_only")
            self.assertEqual(result["marketplace_free_selection"],"requires_platform_configuration")
            with zipfile.ZipFile(dest) as z:
                self.assertIn(".codebuddy-plugin/plugin.json",z.namelist())
                self.assertNotIn("integrations/workbuddy",z.namelist())
                self.assertLess(len(z.read("avatars/expert.png")),500*1024)
                compile(z.read("scripts/audit.py"),"audit.py","exec")
                self.assertEqual(set(z.namelist()),set(package.TEXT_FILES)|{"avatars/expert.png"})
                self.assertEqual(json.loads(z.read("references/runtime-policy.json")),package.RUNTIME_POLICY)
    def test_release_without_real_author_email_fails(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ValueError):package.build(Path(td)/"release.zip",release=True,author_email="")
            self.assertFalse((Path(td)/"release.zip").exists())

    def test_release_keeps_confirmed_author_and_platform_checks_pending(self):
        with tempfile.TemporaryDirectory() as td:
            dest=Path(td)/"release.zip";result=package.build(dest,release=True)
            self.assertEqual(result["market_metadata"],"passed")
            self.assertEqual(result["warnings"],[])
            self.assertEqual(result["platform_install"],"not_run")
            with zipfile.ZipFile(dest) as z:
                m=json.loads(z.read(".codebuddy-plugin/plugin.json"))
                source=json.loads((ROOT/"expert/.codebuddy-plugin/plugin.json").read_text())
                self.assertEqual(m["author"],source["author"])
                self.assertTrue(package.valid_email(m["author"]["email"]))
    def test_existing_archive_not_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            dest=Path(td)/"review.zip";dest.write_bytes(b"old")
            with self.assertRaises(FileExistsError):package.build(dest)
            self.assertEqual(dest.read_bytes(),b"old")
    def test_default_prompt_mismatch_fails(self):
        contents={n:(ROOT/"expert"/n).read_bytes() for n in package.TEXT_FILES}
        contents["avatars/expert.png"]=package.avatar()
        m=json.loads(contents[".codebuddy-plugin/plugin.json"])
        m["defaultInitPrompt"]["zh"]="different"
        errors,_=package.validate(m,contents)
        self.assertTrue(any("prompt mismatch" in e for e in errors))

if __name__=="__main__":unittest.main()
