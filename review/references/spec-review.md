# Spec and document review lens

Apply the canonical passes to the document's rules and claims, not only its
wording. Quote the exact load-bearing statement when identifying a gap.

- **Contradictions:** assumptions, definitions, requirements, and worked examples
  agree across sections and across documents.
- **Missing cases:** hidden preconditions, failure modes, recovery, compatibility,
  and open decisions are explicit rather than implied away.
- **Problem fit:** the mechanism solves the stated problem, not an easier adjacent one.
- **Metrics:** success measures cannot be maximized without achieving the goal;
  describe a degenerate implementation if the metric is gameable.
- **Ownership:** responsibilities, interfaces, decisions, and necessary timelines
  have identifiable owners.
- **Evidence:** claims are no stronger than their sources; numbers, benchmarks,
  and expected outcomes have a verification path.
- **Feasibility:** rollout, operations, testing, and rollback match actual capabilities.
- **Diagrams:** relationships, lifecycle transitions, and flows match the prose.

Distinguish a confirmed contradiction from a domain question requiring the
reviewer's judgment. Do not require speculative implementation detail from a
document whose agreed scope intentionally leaves it open.
