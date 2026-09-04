# 4.6 Implementation

*Draft grounded in the current SceneLens codebase (v3). Every model name, prompt-assembly detail, and scope mapping below is taken directly from the implementation. Points that are hard-coded (and therefore stable across sessions) are noted; points that vary with creator input are noted as such.*

---

## 4.6.1 System architecture

SceneLens is a web application. The client is a single-page React 19 application (Vite build) with a Zustand store holding all storyboard state — the Cut Plan, the generated panels, the four-scope revision state, seam records, scene constraints, and the viewer readings. The server is a FastAPI (Python) service that exposes one HTTP endpoint per directing operation (cut planning, scene-constraint extraction, per-lens diagnosis, cross-lens relation, seam insertion / merge / split, shot revision, panel image generation, reference-image generation, spatial-layout extraction, and the intention-blind viewer reading). The client calls these endpoints directly; there is no intermediate orchestration layer, and no server-side session — all workflow state lives in the client store and is checkpointed to the browser so a reload during a session does not lose work.

All language-model calls go to the OpenAI Chat Completions API with strict JSON-schema-constrained responses (`response_format: json_schema, strict: true`); the client never parses free-form model text. Image generation uses the OpenAI Images API (`gpt-image` family) by default, with an optional Black Forest Labs FLUX endpoint selectable from the generation bar. Panel and reference images are exchanged as base64 PNG.

## 4.6.2 Models

SceneLens assigns a model tier to each operation rather than routing everything through one model. The assignment is fixed in code, not chosen at runtime:

| Operation | Model tier | Rationale (from code comments) |
|---|---|---|
| Story → scene/beat structure | `gpt-5.4-mini` | structural, text-only |
| Beat → Cut Plan | `gpt-5.4-nano`, with a second `gpt-5.4-mini` pass that only re-checks the "characters present" field | cut segmentation is cheap; deciding who is in frame needs more inference and was the field the smaller model most often got wrong |
| Scene-constraint (mise-en-scène) extraction | `gpt-5.4-nano` | reads the script only |
| Narrative lens (pre- and post-generation) | `gpt-5.4-mini` | judges the script, not pixels |
| Mise-en-scène / cinematography / editing lenses | `gpt-5.4` (vision) | must read pose, gaze direction, screen direction, and relative placement *from the panel image*; the smaller tier drew these from the event description instead of the drawing |
| Cross-lens relation pass | `gpt-5.4` | reasons over the already-produced lens results |
| Intention-blind viewer reading | `gpt-5.4` (vision) | the panel pixels are the only evidence available to it |
| Intent–reading comparison (post-viewer) | `gpt-5.4-mini` | compares two short text lists |
| Seam insert / merge / split proposals | `gpt-5.4` when panel images are attached, `gpt-5.4-mini`/`-nano` when text-only | |
| Shot revision proposal, seam-relation defaults | `gpt-5.4-nano` | |
| Spatial-layout (2D floor plan) extraction | `gpt-5.4` (vision) | |
| Panel image generation / regeneration | `gpt-image-2` (default), `gpt-image-1`, or `flux-2-klein` (creator-selectable) | |
| Reference-image generation (character / location) | same model as the panel generator, so reference and panel share a rendering model |

Every tier is overridable by an environment variable, but the defaults above are what participants used.

## 4.6.3 Planning: the Cut Plan

A creator submits a short story or script. SceneLens runs two calls in sequence:

1. **Structure.** The story is turned into scenes (a continuous span of time and place) and beats (a phase shift within a scene), plus a character list with a one-line appearance note per character. The prompt instructs the model to *retain the writer's concrete facts and mark its own connective additions*, so a creator can see which beats they wrote and which the system inferred.
2. **Cut planning.** For each beat, the model proposes cuts. The prompt is explicit that **cut count is not line count** — one line may become several cuts, several lines may become one — and that shot size, angle, and camera move are *not* decided here (they belong to the shot stage). Each proposed cut carries: its beat index, `time`, `place`, a one-sentence `content` (what a single frame shows), a 2–6-character `purpose` label (e.g. "공간 설정", "행동 강조"), and the `characters` visible in frame. A second pass re-derives only the `characters` field, because the segmentation model over-applied "only what is literally visible" and dropped characters who are obviously present.

The creator then edits this table directly: add, remove, reorder, or duplicate cuts, edit any field, or **leave shot size / angle / camera move blank**. A blank framing field is a first-class state, not a default — it is what the paper calls an *open decision*, and the generator is allowed to instantiate it. Shot-size and angle values are drawn from a fixed vocabulary (the same list the diagnostic lenses are told about, so that a suggested alternative maps onto a value the creator can actually select).

Narrative is the only lens available before generation: it reads the Cut Plan text and flags beats that restate a state without advancing it, actions written as summary rather than as something drawable, information revealed too early or too late, and missing causal links between adjacent events.

## 4.6.4 Generation

Panel prompts are assembled deterministically from the current state — the language model does not write the image prompt. For each cut the client gathers: the cut `content` and `purpose`; the scene constraints (location identity, fixed props, time of day, per-scene character overrides); any responsibility declarations the creator has resolved; the seam record on the preceding cut (how it connects, how much time has elapsed, what was elided); and the panel's shot size / angle. The server then wraps this with fixed instructions that (a) forbid any legible text in the drawing, (b) require a rough, hand-drawn sketch quality rather than a finished render — *"a finished drawing reads as already decided and blocks judgment"* — and (c) constrain continuity: match the previous panel's location, lighting, drawing style, and the left/right screen positions of continuing characters, and do not reverse travel direction or camera side unless this panel explicitly asks for it.

Reference images (a neutral portrait per character, a plan view per location, an optional top-down layout diagram, and a style anchor that fixes rendering density) are passed as image inputs to the image-edit API. The prompt tells the model, per reference kind, what that image controls: character references are *identity only, not pose*; the style anchor controls *only line weight and detail level, never its people or its room*; neighbour panels are *continuity references, not things to copy*.

Regeneration reuses the same assembly path. When the creator changes one value (a shot size, an angle, or the cut sentence) after a panel already exists, SceneLens attaches the **current** panel image as a reference and passes an explicit delta — *"the only thing that changes is: angle Eye level → Low angle; everything else stays"* — so a single-parameter revision does not re-roll the whole composition and the creator can compare what that one choice changed. The client tracks, per panel, a signature of the `{content, shotSize, angle}` it was last drawn from; a "redraw" affordance appears only when the current cut differs from that signature.

## 4.6.5 Inspecting: the cinematic lenses

### Input

A directing review request carries: the creator's stated `intent` for the scene; the ordered list of panels in the reviewed range, each with its `id`, `scene_id`, the creator-supplied `context` (event description) and `directing_notes` (arrows and margin notes the creator drew on the panel), and the panel image itself (base64); optionally a *focus* object when the creator is re-examining one already-found concern through a different lens or a viewer-raised point; and, for the cross-lens relation pass, the already-produced lens results.

The review runs in three modes: a **single lens** (`mise` | `camera` | `editing`), **multi** (mise, camera, and editing fanned out concurrently with `asyncio.gather`, each lens judging independently before any relation is drawn), and **relate** (relation only, over lens results already returned, with no images re-uploaded — this is a separate call because doing lens analysis and relation in one shot takes on the order of a minute and mixes up which lens made which judgment).

### Fixed diagnostic rules

Each lens has a **fixed set of four rules**, defined in code, not generated per request. For example the mise-en-scène lens has: *functional elements* (is the person / prop / space this event needs identifiable in frame?), *relational blocking* (do the characters' distance and posture read as the intended relationship?), *spatial continuity* (across cuts, can you tell who is where?), and *visual hierarchy* (does the eye go first to what should be seen first?). Cinematography and editing each have their own four; narrative has four for the pre-generation script check.

Every rule is a struct with: a one-sentence `criterion` written for the creator to read (so the creator can dispute the *standard*, not just the verdict), a `trigger` condition, a `reject_when` condition (the cases where this is *not* a defect — deliberate concealment, another cut carrying the function, a problem that is really framing, etc.), and two `theory_refs` into a curated library. The rule text is rendered into a stable prompt packet; the model must pick exactly one rule ID, verify both its trigger and its reject conditions against the panels and the stated intent, and copy that rule ID into its output. If no rule's condition is met, it returns no diagnosis for that level.

### Theory grounding

The theory library holds 2,079 indexed passages from ten filmmaking texts (*The Five C's of Cinematography*, *The Filmmaker's Eye*, *In the Blink of an Eye*, *Film Directing: Shot by Shot*, etc.). SceneLens does **not** do open retrieval over it. Each fixed rule is hand-linked to exactly two passages; only those passages are offered to the model when that rule is selected, and the model's cited `theory_source` is validated against that whitelist. This keeps the vocabulary stable and prevents a keyword-matched but irrelevant technique from entering the explanation.

### Output

Per lens, the model returns a `stance`, a `summary`, exactly four `level_assessments` (one status — keep / check / change — for each diagnostic level, so a level with no defect is still reported), and at most one `diagnosis` per level. A diagnosis carries: the chosen `rule_id`; the `level`; a `targets` list (which panels / elements it concerns); a `diagnosis` sentence and up to two `evidence` sentences, both required to be grounded in visible cues, not in the event description; optional `visual_evidence` as boxes or a two-point relation that can be drawn on the panel; a `suggested_action` that must be something the creator can do by hand ("enlarge the graph to a third of the frame", not "emphasise it"); and up to three `alternatives`, the first of which is always **"keep as is"** — a validator inserts it if the model omitted it, because without it the diagnosis becomes an instruction. The model may also attach one `question` when the artifact alone cannot settle the choice ("is recognising the graph or seeing the expression more important here?").

The whole response is validated (target-path grammar, seam targets must be exactly two adjacent panels, sequence targets must span ≥2 panels, IDs must be lens-prefixed, theory source must be whitelisted). On failure the request is retried up to three times with the specific validation error fed back; on the final attempt an offending *question* is dropped but diagnoses are kept.

The interaction the creator sees is: **directing decision → evidence → creator judgment → optional revision**. SceneLens keeps, selects an alternative, or hands off to revision — it does not apply its own diagnosis.

## 4.6.6 Revising across scopes

SceneLens represents the four scopes as distinct edit targets and logs every revision with its scope (`element` / `shot` / `seam` / `sequence`), which lens (if any) prompted it, and its source (diagnosis / viewer / manual):

- **Element** — editing the cut sentence, a dialogue line, a depicted attribute, or a per-cut requirement. Redraw uses the single-parameter delta path (§4.6.4).
- **Shot** — changing shot size, angle, camera move, or the cut's role, then redrawing that one panel with its current image as reference.
- **Seam** — the space *between* two adjacent panels is an explicit object. Each seam records how the two cuts connect (`cut` / `match` / `dissolve` / `fade`), how much time passes (`continuous` / `brief` / `elapsed`), and any `elision` (what happens between the cuts but is not drawn). From an open seam the creator can **insert** a cut (the server proposes 2–3 candidates from the elision note or from the content gap between the neighbours), **merge** the two cuts (their sentences are concatenated with the elision, requirements are unioned, and the merged panel is left blank for the creator to redraw), or split. A newly inserted or merged cut becomes a blank panel with a prompt editor, not an auto-generated image.
- **Sequence** — reordering cuts (the panels move with them), editing beat structure, or editing shared scene constraints. Reordering re-numbers the plan and re-sorts the parallel panel list.

Because a diagnosis records its `targets` (where the concern is visible) separately from the revision the creator chooses (where they act), a continuity problem that shows up in one panel can be resolved by a seam insertion or a reorder without treating either panel as defective. The paper's distinction — *where a concern becomes visible* vs. *where the creator intervenes* — is enforced by these being separate fields, not the same one.

## 4.6.7 Reappraising: the intention-blind viewer

The viewer call receives **only the panel images, in order**. It does not receive the story, the script, the Cut Plan, shot labels, the creator's stated intent, or the creator's directing notes; the prompt explicitly forbids inferring them from metadata. A *viewer profile* may be supplied — a built-in stance ("first-time viewer", "attending to directing", "attending to cut-to-cut connection") or a creator-written attention instruction — but it only steers *what the viewer attends to in the pixels*; it never supplies story context.

The viewer reads the panels strictly in order and returns a cumulative trace: per panel, the 1–3 cues it actually noticed, its immediate reading (capped at 45 Korean characters so it fits the fixed-width track cell), a brief feeling, how this panel relates to the previous one (`start` / `reinforced` / `shifted` / `unsettled` / `new_question`), its running hypothesis, and one open question that would pull it to the next panel — with a hard rule that it may not re-ask something an earlier panel already answered. It then reports the panel that most changed its reading (a turning point), 0–2 interpretive branches where the visible sequence genuinely supports a different reading, the questions the pixels leave open, up to four points where its viewing behaviour changed (`continue` / `pause` / `recheck` / `push_through` / `exit_risk`), and what it still remembers after reaching the end. The prompt bars it from diagnosing a directing problem, naming a production cause, or suggesting an edit — *"this is a viewing trace, not criticism"*.

After the reading, a separate `gpt-5.4-mini` call compares each cut's creator-set `purpose` against what the viewer read at that panel and returns one verdict per cut — `reached` / `partial` / `missed` / `unknown` — with, for the misses, a two-phrase `intended` vs. `read_as` and a one-sentence `screen_cause` drawn only from what the viewer cited. This comparison is the only place the creator's intent meets the viewer's reading, and it happens *after* the intention-blind reading is complete; it produces no suggestions. Where a verdict or a viewer branch raises a concern, the creator can send that point back into the directing-review interface as a focus object, and the lenses re-connect it to the relevant decisions and scopes.

## 4.6.8 Latency and prompt stability

Lens diagnosis and the viewer reading are vision calls over multiple full-resolution panels and take on the order of tens of seconds; the multi-lens review runs the three lenses concurrently, and the cross-lens relation is a deliberately separate, image-free call so the creator can read each lens result while the relation is still computing. The client uses a 120-second request timeout.

The parts of the system that shape *what gets diagnosed* are fixed and identical across participants: the four rules per lens, their criteria and reject conditions, the rule→theory whitelist, the shot-size / angle vocabulary, the panel-prompt assembly template, and what the viewer is and is not given. What varies per session is only the creator's story, their Cut Plan edits, their stated intent, and which model tier an environment override might select. Image models can drift over time; the rule set, scope model, and viewer contract do not.
