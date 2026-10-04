#!/usr/bin/env python3
"""Disposable file fixture; never reads production credentials."""
import importlib.util
import json
import os
import sys
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location("model_deploy", Path(__file__).with_name("prepare-model-deploy.py"))
sys.dont_write_bytecode = True
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix="naumi-model-deploy-") as folder:
    root = Path(folder)
    app = root / "app.env"
    router = root / "router.env"
    origins = root / "origins.json"
    out = root / "prepared"
    original_app = "# preserved production fixture\nSETTINGS_SECRET=existing-fixture-settings-secret\nOPENAI_BASE_URL=http://172.20.0.1:3100/v1\nEXISTING_KEY=unchanged\n"
    original_router = "NAUMI_ROUTER_TOKEN=fixture-legacy-generation-token-unchanged\nAPIMART_KEY=fixture-only\n"
    app.write_text(original_app)
    router.write_text(original_router)
    origins.write_text(json.dumps(["http://172.20.0.1:3100", "https://supplier.example"]))
    module.prepare(app, router, origins, out)
    assert app.read_text() == original_app and router.read_text() == original_router
    first = (out / "app.env").read_text()
    assert first.startswith(original_app)
    assert "EXISTING_KEY=unchanged" in first
    values = module.read_env(out / "app.env")
    router_values = module.read_env(out / "router.env")
    assert router_values["NAUMI_MODEL_CAPACITY_URL"] == "http://127.0.0.1:3012/api/internal/model-capacity"
    assert values["NAUMI_ROUTER_GENERATION_TOKEN"] == "fixture-legacy-generation-token-unchanged"
    assert values["NAUMI_ROUTER_MANAGEMENT_TOKEN"] == router_values["NAUMI_ROUTER_MANAGEMENT_TOKEN"]
    assert values["MODEL_CONFIG_ENVELOPE_SECRET"] == router_values["MODEL_CONFIG_ENVELOPE_SECRET"]
    assert len(set(values[k] for k in ["NAUMI_ROUTER_MANAGEMENT_TOKEN", "NAUMI_ROUTER_GENERATION_TOKEN", "MODEL_CONFIG_ENVELOPE_SECRET"])) == 3
    assert "http://172.20.0.1:3100" in values["MODEL_CONFIG_TRUSTED_ORIGINS"]
    module.prepare(app, router, origins, out)
    assert (out / "app.env").read_text() == first, "recovery must retain the same private credentials"
    if os.name != "nt":
        assert out.stat().st_mode & 0o777 == 0o700
        for name in ["app.env", "router.env", "model-secrets.env"]:
            assert (out / name).stat().st_mode & 0o777 == 0o600
    origins.write_text(json.dumps(["http://169.254.169.254"]))
    try:
        module.prepare(app, router, origins, out)
        raise AssertionError("metadata must never enter allowlist")
    except ValueError:
        pass
print("MODEL_DEPLOY_CREDENTIAL_PRESERVATION=PASS")
