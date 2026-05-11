"""Concept map generation via Claude (see docs/ai-pipeline.md)."""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from .flashcards import MODEL, _get_client, _safe_json_parse, call_with_retry

MAX_TOKENS = 1500

CONCEPT_MAP_SYSTEM = """You are an expert at constructing concept maps from academic content.

Output ONLY valid JSON — no markdown fences, no preamble.

Return a JSON object with exactly:
  - "nodes": array of node objects
  - "edges": array of edge objects

Node objects:
  - "id":    string — lowercase slug (hyphens, no spaces), unique
  - "label": string — human-readable concept name (2–4 words max)
  - "type":  "concept" | "process" | "example"

Edge objects:
  - "source": string — id of source node
  - "target": string — id of target node
  - "label":  string — short verb phrase (e.g. "inhibits", "causes", "is a type of")

Constraints:
  - 8–14 nodes, 10–18 edges
  - Every node must have at least one edge
  - No isolated nodes
  - Prefer edges that show mechanism or causality over simple "related to" edges
  - "example" nodes should connect to their parent concept with "is an example of" """


def _response_text(response: object) -> str:
    parts: list[str] = []
    for block in getattr(response, "content", ()) or ():
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def _validate_concept_map(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("concept map JSON must be an object")

    if set(data.keys()) != {"nodes", "edges"}:
        raise ValueError('concept map must contain exactly the keys "nodes" and "edges"')

    nodes_raw = data["nodes"]
    edges_raw = data["edges"]
    if not isinstance(nodes_raw, list):
        raise ValueError("nodes must be an array")
    if not isinstance(edges_raw, list):
        raise ValueError("edges must be an array")

    node_types = {"concept", "process", "example"}
    nodes: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for i, n in enumerate(nodes_raw):
        if not isinstance(n, dict):
            raise ValueError(f"node {i} must be an object")
        nid = n.get("id")
        label = n.get("label")
        ntype = n.get("type")
        if not isinstance(nid, str) or not nid.strip():
            raise ValueError(f"node {i}: id must be a non-empty string")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"node {i}: label must be a non-empty string")
        if ntype not in node_types:
            raise ValueError(f"node {i}: type must be concept, process, or example")
        if nid in seen_ids:
            raise ValueError(f"duplicate node id: {nid!r}")
        seen_ids.add(nid)
        nodes.append({"id": nid, "label": label, "type": ntype})

    edges: list[dict[str, str]] = []
    for i, e in enumerate(edges_raw):
        if not isinstance(e, dict):
            raise ValueError(f"edge {i} must be an object")
        src = e.get("source")
        tgt = e.get("target")
        elabel = e.get("label")
        if not isinstance(src, str) or not src.strip():
            raise ValueError(f"edge {i}: source must be a non-empty string")
        if not isinstance(tgt, str) or not tgt.strip():
            raise ValueError(f"edge {i}: target must be a non-empty string")
        if not isinstance(elabel, str) or not elabel.strip():
            raise ValueError(f"edge {i}: label must be a non-empty string")
        if src not in seen_ids:
            raise ValueError(
                f'edge {i}: source {src!r} is not the id of any node'
            )
        if tgt not in seen_ids:
            raise ValueError(
                f'edge {i}: target {tgt!r} is not the id of any node'
            )
        edges.append({"source": src, "target": tgt, "label": elabel})

    return {"nodes": nodes, "edges": edges}


def _generate_concept_map_once(chunks: list[dict], subject: str) -> dict[str, Any]:
    combined = "\n\n".join(c["text"] for c in chunks[:12])

    response = _get_client().messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=CONCEPT_MAP_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Subject: {subject}\n\n"
                    f"Lecture content:\n{combined}\n\n"
                    "Generate a concept map capturing the key concepts and their relationships."
                ),
            }
        ],
    )

    text = _response_text(response)
    parsed = _safe_json_parse(text)
    return _validate_concept_map(parsed)


def generate_concept_map(chunks: list[dict], subject: str) -> dict:
    """Generate a concept map graph from lecture content."""
    return call_with_retry(_generate_concept_map_once, chunks, subject)


def main() -> None:
    chunks = json.load(sys.stdin)
    subject = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.environ.get("SUBJECT", "General")
    )
    cm = generate_concept_map(chunks, subject)
    print(f"Node count: {len(cm['nodes'])}")
    print(f"Edge count: {len(cm['edges'])}")
    print("Edges:")
    print(json.dumps(cm["edges"], indent=2))


if __name__ == "__main__":
    main()
