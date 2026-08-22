"""Deterministic harbor-dsh-evaluator/v1 implementation for the concept dataset."""

import re

PROTOCOL = "evaluation-result/v1"
ENGAGING_MARKERS = ("例如", "比如", "想象", "就像", "有趣", "反直觉", "可以把", "换句话说")


def _visible_length(value):
    return len(re.sub(r"\s+", "", str(value or "")))


def _concept_coverage(answer, groups):
    folded = str(answer or "").casefold()
    return sum(any(str(term).casefold() in folded for term in group) for group in groups)


def _response_quality(answer, task):
    coverage = _concept_coverage(answer, task.get("answer_concepts") or [])
    length = _visible_length(answer)
    if length >= 35 and coverage >= 2:
        score = 1
    elif length >= 15 and coverage >= 1:
        score = 0.5
    else:
        score = 0
    return score, f"有效长度 {length}；覆盖 {coverage}/{len(task.get('answer_concepts') or [])} 个核心概念组。"


def _interestingness(answer):
    length = _visible_length(answer)
    sentences = len([item for item in re.split(r"[。！？!?]+", str(answer or "")) if item.strip()])
    engaging = any(marker in str(answer or "") for marker in ENGAGING_MARKERS)
    if length >= 80 and (engaging or sentences >= 3):
        score = 1
    elif length >= 35 or engaging:
        score = 0.5
    else:
        score = 0
    return score, f"有效长度 {length}；{sentences} 个句子；{'包含' if engaging else '未包含'}例子、类比或反直觉表达。"


def _citation_compliance(result, task, catalog):
    source_ids = {item.get("id") for item in catalog.get("sources") or []}
    expected = task.get("expected_source_id")
    citations = result.get("citations") or []
    citation_ids = [item.get("source_id") for item in citations if isinstance(item, dict)]
    citations_known = bool(citations) and len(citation_ids) == len(citations) and all(identity in source_ids for identity in citation_ids)
    expected_cited = expected in citation_ids
    searches = result.get("searches") or []
    search_grounded = bool(searches) and all(
        isinstance(item, dict)
        and str(item.get("query") or "").strip()
        and item.get("status") == "ok"
        and expected in (item.get("matched_source_ids") or [])
        for item in searches
    )
    tools_clean = result.get("tool_errors") == 0
    if citations_known and expected_cited and search_grounded and tools_clean:
        score = 1
    elif citations_known:
        score = 0.5
    else:
        score = 0
    return score, f"引用已知={citations_known}；目标来源已引用={expected_cited}；检索轨迹有效={search_grounded}；工具无错误={tools_clean}。"


def _recommendation(criterion, score, task):
    topic = task.get("topic") or task.get("id") or "当前主题"
    if criterion == "response_quality":
        if score == 1:
            return f"保持对“{topic}”核心概念的完整覆盖，并用回归评测防止遗漏。"
        if score == 0.5:
            return f"补齐“{topic}”尚未覆盖的核心概念组，并明确它们之间的关系。"
        return f"重新回答“{topic}”的问题，先覆盖至少两个 Rubric 指定的核心概念组。"
    if criterion == "interestingness":
        if score == 1:
            return "保留当前解释节奏，并在后续版本中维持例子、类比或反直觉细节。"
        if score == 0.5:
            return "增加一个具体例子、类比或反直觉细节，并把回答展开为至少三个完整句子。"
        return "重写过短回答，用普通读者能理解的例子解释抽象概念。"
    if score == 1:
        return "保持先检索、后引用且只引用实际命中来源的流程。"
    if score == 0.5:
        return "补齐有效检索轨迹，并确认引用指向本 Task Source Catalog 中的目标来源。"
    return "先执行有效检索，移除未知来源，再引用实际命中的 source id。"


def evaluate(payload):
    if payload.get("schema_version") != 1 or payload.get("protocol") != "evaluation-input/v1":
        raise ValueError("Evaluator input must use evaluation-input/v1")
    task = payload.get("task") or {}
    result = payload.get("candidate_output") or {}
    catalog = payload.get("evidence") or {}
    answer = result.get("answer") or ""
    quality, quality_reason = _response_quality(answer, task)
    interesting, interesting_reason = _interestingness(answer)
    citation, citation_reason = _citation_compliance(result, task, catalog)
    return {
        "schema_version": 1,
        "protocol": PROTOCOL,
        "criteria": [
            {
                "id": "response_quality",
                "score": quality,
                "reason": quality_reason,
                "recommendation": _recommendation("response_quality", quality, task),
            },
            {
                "id": "interestingness",
                "score": interesting,
                "reason": interesting_reason,
                "recommendation": _recommendation("interestingness", interesting, task),
            },
            {
                "id": "citation_compliance",
                "score": citation,
                "reason": citation_reason,
                "recommendation": _recommendation("citation_compliance", citation, task),
            },
        ],
    }
