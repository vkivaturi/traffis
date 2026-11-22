"""Filesystem store for bundled example networks and user-authored networks."""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from .compiler import CompileError, CompileResult, compile_network, write_text_safe
from .schema import ID_PATTERN, NetworkProject, ValidationIssue, validate_network

if TYPE_CHECKING:
    from .scenario import UserNetworkScenario

logger = logging.getLogger("network_store")

EXAMPLES_DIR = Path(__file__).resolve().parent / "examples"


def resolve_user_networks_dir() -> Path:
    env_dir = os.environ.get("TRAFFIS_NETWORKS_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()
    return (Path.home() / "Traffis" / "networks").resolve()


@dataclass
class NetworkRecord:
    id: str
    scenario_id: str
    name: str
    description: str
    path: Path
    build_dir: Path
    read_only: bool


class NetworkStore:
    def __init__(self, user_dir: Optional[Path] = None, examples_dir: Optional[Path] = None):
        self.user_dir = Path(user_dir).resolve() if user_dir else resolve_user_networks_dir()
        self.examples_dir = Path(examples_dir).resolve() if examples_dir else EXAMPLES_DIR

    def _discover_in(self, base_dir: Path, read_only: bool) -> List[NetworkRecord]:
        records: List[NetworkRecord] = []
        if not base_dir.is_dir():
            return records
        for child in sorted(base_dir.iterdir()):
            if not child.is_dir():
                continue
            net_json = child / "network.json"
            if not net_json.is_file():
                continue
            try:
                raw = json.loads(net_json.read_text(encoding="utf-8"))
                nid = str(raw.get("id") or child.name)
                if not ID_PATTERN.match(nid):
                    continue
                name = str(raw.get("name") or nid)
                desc = str(raw.get("description") or "")
                records.append(
                    NetworkRecord(
                        id=nid,
                        scenario_id=f"net_{nid}",
                        name=name,
                        description=desc,
                        path=net_json,
                        build_dir=child / "build",
                        read_only=read_only,
                    )
                )
            except Exception as e:
                logger.warning("Skipping invalid network.json at %s: %s", net_json, e)
        return records

    def list_records(self) -> List[NetworkRecord]:
        # User networks override bundled examples with the same id
        by_id: Dict[str, NetworkRecord] = {}
        for rec in self._discover_in(self.examples_dir, read_only=True):
            by_id[rec.id] = rec
        for rec in self._discover_in(self.user_dir, read_only=False):
            by_id[rec.id] = rec
        return list(by_id.values())

    def get_record(self, network_id: str) -> Optional[NetworkRecord]:
        for rec in self.list_records():
            if rec.id == network_id:
                return rec
        return None

    def get_project(self, network_id: str) -> Optional[NetworkProject]:
        rec = self.get_record(network_id)
        if not rec:
            return None
        raw = json.loads(rec.path.read_text(encoding="utf-8"))
        return NetworkProject.model_validate(raw)

    def save_and_compile(self, network_id: str, payload: Dict[str, Any]) -> TupleResult:
        if not ID_PATTERN.match(network_id):
            raise CompileError(
                f"Invalid network id '{network_id}'. Must match [A-Za-z][A-Za-z0-9_]*.",
                issues=[
                    ValidationIssue(
                        severity="error",
                        code="invalid_id",
                        message=f"Invalid network id '{network_id}'.",
                        element_type="network",
                        element_id=network_id,
                    )
                ],
            )
        data = {**payload, "id": network_id}
        project = NetworkProject.model_validate(data)
        issues = validate_network(project)
        errors = [i for i in issues if i.severity == "error"]
        if errors:
            raise CompileError("; ".join(e.message for e in errors[:5]), issues=errors)

        target_dir = self.user_dir / network_id
        target_dir.mkdir(parents=True, exist_ok=True)
        net_json = target_dir / "network.json"
        build_dir = target_dir / "build"

        # Compile first into a staging dir so invalid netconvert/reachability never overwrites a good file
        with tempfile.TemporaryDirectory(prefix=f"traffis_stage_{network_id}_") as tmp:
            compile_network(project, Path(tmp), force=True)

        write_text_safe(net_json, json.dumps(project.model_dump(by_alias=True), indent=2) + "\n")
        compile_res = compile_network(project, build_dir, force=False)
        from .scenario import UserNetworkScenario
        scenario = UserNetworkScenario(net_json, build_dir=build_dir)
        return TupleResult(project=project, compile_result=compile_res, scenario=scenario, path=net_json)

    def delete_network(self, network_id: str) -> bool:
        target_dir = self.user_dir / network_id
        if not target_dir.is_dir():
            return False
        shutil.rmtree(target_dir)
        return True

    def validate_payload(self, payload: Dict[str, Any], run_netconvert: bool = True) -> Dict[str, Any]:
        try:
            project = NetworkProject.model_validate(payload)
        except Exception as e:
            return {
                "valid": False,
                "errors": [
                    ValidationIssue(severity="error", code="schema_error", message=str(e)).model_dump()
                ],
                "warnings": [],
            }

        issues = validate_network(project)
        errors = [i for i in issues if i.severity == "error"]
        warnings = [i.message for i in issues if i.severity == "warning"]
        if errors:
            return {
                "valid": False,
                "errors": [e.model_dump() for e in errors],
                "warnings": warnings,
            }

        if run_netconvert:
            try:
                with tempfile.TemporaryDirectory(prefix="traffis_validate_") as tmp:
                    res = compile_network(project, Path(tmp), force=True)
                    warnings.extend(res.warnings)
            except CompileError as ce:
                return {
                    "valid": False,
                    "errors": [i.model_dump() for i in ce.issues],
                    "warnings": warnings,
                }

        return {"valid": True, "errors": [], "warnings": warnings}

    def sync_registry(self, reg: Any) -> List[str]:
        """Register all discovered networks into `ScenarioRegistry` and remove deleted ones."""
        records = self.list_records()
        active_sids = {rec.scenario_id for rec in records}

        for existing_sid in list(reg.list_user_scenario_ids()):
            if existing_sid not in active_sids:
                reg.unregister(existing_sid)

        from .scenario import UserNetworkScenario
        registered: List[str] = []
        for rec in records:
            try:
                scenario = UserNetworkScenario(rec.path, build_dir=rec.build_dir)
                reg.register(scenario, is_user_network=True)
                registered.append(rec.scenario_id)
            except Exception as e:
                logger.warning("Failed to register network '%s': %s", rec.id, e)
        return registered


@dataclass
class TupleResult:
    project: NetworkProject
    compile_result: CompileResult
    scenario: UserNetworkScenario
    path: Path


network_store = NetworkStore()
