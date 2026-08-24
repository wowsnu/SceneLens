"""Route intention-blind reading symptoms without using director-intent diagnostics."""

from dataclasses import dataclass
from typing import Literal


ViewerRoute = Literal["mise", "camera", "editing"]
ViewerIssueKind = Literal[
    "element_visibility",
    "spatial_relation",
    "framing_readability",
    "cut_connection",
    "information_order",
]


@dataclass(frozen=True)
class ViewerRoutingRule:
    default_route: ViewerRoute
    allowed_causes: tuple[ViewerRoute, ...]
    reason: str


# These rules classify the *source of a reading problem*, not whether a
# creative decision is a defect. That later judgement belongs to the existing
# intent-aware directing diagnostics.
VIEWER_ROUTING_RULES: dict[ViewerIssueKind, ViewerRoutingRule] = {
    "element_visibility": ViewerRoutingRule(
        default_route="camera",
        allowed_causes=("mise", "camera"),
        reason="필요한 요소가 읽히지 않는 문제는 배치 또는 프레이밍 중 원인을 확인합니다.",
    ),
    "spatial_relation": ViewerRoutingRule(
        default_route="mise",
        allowed_causes=("mise", "camera"),
        reason="인물·소품·공간 관계의 문제는 배치에서 먼저 확인합니다.",
    ),
    "framing_readability": ViewerRoutingRule(
        default_route="camera",
        allowed_causes=("camera",),
        reason="크기·시점·프레이밍 때문에 읽기 어려운 문제는 촬영에서 확인합니다.",
    ),
    "cut_connection": ViewerRoutingRule(
        default_route="editing",
        allowed_causes=("editing",),
        reason="둘 이상의 컷 사이 연결 문제는 편집 범위에서 확인합니다.",
    ),
    "information_order": ViewerRoutingRule(
        default_route="editing",
        allowed_causes=("editing",),
        reason="정보가 드러나는 순서의 문제는 편집 흐름에서 먼저 확인합니다.",
    ),
}


RELATIONAL_ISSUE_KINDS = {"cut_connection", "information_order"}


def normalize_viewer_panel_orders(
    panel_orders: list[int],
    issue_kind: ViewerIssueKind,
    panel_count: int,
) -> list[int]:
    """Ensure a cross-cut issue always carries the smallest usable comparison range."""
    orders = sorted({order for order in panel_orders if 1 <= order <= panel_count})
    if issue_kind not in RELATIONAL_ISSUE_KINDS or len(orders) != 1 or panel_count < 2:
        return orders

    order = orders[0]
    adjacent_order = order + 1 if order < panel_count else order - 1
    return sorted([order, adjacent_order])


def resolve_viewer_route(
    issue_kind: ViewerIssueKind,
    suspected_cause: ViewerRoute,
    panel_orders: list[int],
) -> tuple[list[ViewerRoute], Literal["single", "range"], str]:
    """Return a validated route plus a scope derived only from affected panels."""
    rule = VIEWER_ROUTING_RULES[issue_kind]
    route = suspected_cause if suspected_cause in rule.allowed_causes else rule.default_route
    unique_orders = list(dict.fromkeys(panel_orders))
    scope: Literal["single", "range"] = "range" if len(unique_orders) > 1 else "single"
    return [route], scope, rule.reason
