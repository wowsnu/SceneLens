# SceneLens Decision-Centered Storyboard System

## Working Design Specification

- Version: Working Spec v4
- Date: 2026-07-22
- Status: Implementation baseline, subject to revision
- Primary references:
  - ../../system.txt
  - ../../scenelens_decision_pipeline_v3.svg
  - SceneLens v3 prototype
  - Design discussion conducted before implementation

---

## 1. Executive summary

SceneLens is not an AI system that completes a storyboard on behalf of a creator.

SceneLens is a decision-centered storyboard workspace that:

1. turns a script into a provisional narrative and cut scaffold;
2. lets a creator fill panels manually, with AI, or through a mixture of both;
3. exposes directorial choices that were explicitly made by the user or implicitly filled by AI;
4. transforms unreviewed choices into comparable options;
5. lets the creator decide what must be preserved, what remains unresolved, and what is intentionally left open;
6. applies a batch of decisions to the storyboard as a new round;
7. returns intention-blind, cue-grounded alternative readings for reflection;
8. routes the creator back to relevant decisions without automatically judging or correcting the work.

The core lifecycle is:

    expose decisions
    → negotiate options
    → record commitment
    → update the storyboard
    → reflect on possible readings
    → open the next round

The user remains the final decision-maker at every stage.

---

## 2. Central design thesis

### 2.1 The storyboard is an intermediate representation

A storyboard is not a final image that production must reproduce exactly. It is an intermediate artifact that communicates what should be preserved and what may remain flexible during later production.

Low fidelity therefore does not simply mean that an image contains fewer details.

In SceneLens, low fidelity means that the creator selectively specifies:

- which decisions are essential;
- which decisions still require review;
- which decisions are intentionally left flexible.

SceneLens represents storyboard fidelity at the level of decisions, not only at the level of image detail.

### 2.2 AI detail is not automatically a creative decision

AI-generated panels may look complete, but their apparent completeness hides many directorial choices:

- cut count;
- information order;
- staging;
- background;
- props;
- camera distance;
- framing;
- visual tone;
- transition and rhythm.

These details must not silently become final decisions. SceneLens surfaces meaningful AI-filled choices so that the creator can review them.

### 2.3 Agents are lenses, not debating characters

SceneLens agents are not anthropomorphized participants attempting to reach consensus.

Each agent is a structured directorial lens that:

- discovers decisions relevant to its axis;
- generates contrasting options;
- explains likely effects and costs;
- identifies cross-axis consequences.

Long free-form agent debates are not part of the core interaction.

### 2.4 Viewer analysis is a reflection tool, not audience simulation

SceneLens does not claim to simulate an audience or estimate a human interpretation distribution.

Viewer analysis generates:

- one intention-blind sequential reading;
- a small number of cue-grounded alternative readings;
- the points where readings diverge;
- visible cues and additional model inference supporting each reading.

These results are reflection prompts, not audience predictions.

---

## 3. System goals

### G1. Expose hidden directorial choices

Meaningful choices embedded in an AI-generated or hybrid storyboard must become visible and reviewable.

### G2. Present AI-filled details as negotiable options

The current generated result must appear alongside alternatives rather than acting as an unquestioned default.

### G3. Record the commitment level of each decision

The system must distinguish:

- reviewed and fixed;
- unresolved or unreviewed;
- reviewed and intentionally open.

### G4. Support hybrid storyboard construction

The creator must be able to:

- draw a panel by hand;
- generate a panel with AI;
- enhance a sketch;
- import an image;
- leave a panel blank;
- combine these approaches in one scene.

### G5. Support iterative, versioned rounds

Multiple choices should be assembled into a round plan and applied together as a coherent storyboard revision.

### G6. Support cue-grounded reflection

The system should help the creator inspect how the current storyboard can be read without claiming to know how real viewers will respond.

### G7. Preserve human authority

No agent may silently:

- fix a decision;
- open a decision;
- overwrite a fixed decision;
- revise the storyboard;
- declare an interpretation correct.

---

## 4. Non-goals

The core system does not aim to:

- generate a fully finished film;
- force every storyboard panel to the same fidelity;
- optimize toward one objectively best direction;
- simulate demographic audience populations;
- estimate percentages of real viewers;
- make agents converge through conversational debate;
- require the user to articulate a complete directorial intention before starting;
- turn every visible detail into a Decision;
- require all Open decisions to be resolved.

---

## 5. Core terminology

### 5.1 Decision

A Decision is a reviewable directorial choice whose variation could meaningfully affect:

- narrative understanding;
- emotional reading;
- spatial or character relations;
- visual attention;
- continuity or rhythm;
- downstream production guidance.

A Decision is not every visible detail.

Examples:

- reveal the airport only in the last beat;
- keep the character small in the frame;
- place a bag between two characters;
- use a hard cut between shots 3 and 4;
- maintain a cold visual tone across shots 1 to 3.

### 5.2 Decision topic

A Decision topic names the choice that must be reviewed.

Examples:

- camera distance in shot 2;
- reveal timing of the airport;
- placement of the key prop;
- transition between shots 3 and 4.

### 5.3 Current choice

The current choice is the value presently represented in the board.

Example:

- Decision topic: camera distance in shot 2
- Current choice: wide shot

The current choice must be shown as one option among alternatives when the Decision is Tentative.

### 5.4 Option

An Option is a concrete alternative for a Decision topic.

An Option includes:

- proposal;
- expected effect;
- cost or trade-off;
- direct application target;
- potentially affected panels;
- optional preview.

### 5.5 Decision Inventory

The Decision Inventory is the structured collection of meaningful decisions detected from:

- user input;
- user editing actions;
- the Narrative scaffold;
- AI generation traces;
- rendered storyboard panels;
- user-confirmed candidates discovered in sketches.

### 5.6 Round

A Round is one batch of user-reviewed choices applied to the storyboard to produce a new board version.

Individual option previews do not create a round.

### 5.7 Board version

A Board version is the storyboard state resulting from a completed round.

Examples:

- Initial Board: Round 0
- Board after first decision batch: Round 1
- Board after reflection-driven revision: Round 2

---

## 6. Minimal Decision model

The initial implementation should keep the Decision model small.

Required fields:

~~~text
Decision
  id
  topic
  currentChoice
  axis
  targets
  provenance
  status
  createdInRound
  lastUpdatedInRound
  evidence
~~~

Field meanings:

- id: stable identifier across rounds;
- topic: the choice being reviewed;
- currentChoice: the value currently represented in the board;
- axis: Narrative, Mise-en-scène, Cinematography, or Editing;
- targets: selected panels, transitions, or the whole scene;
- provenance: User or AI;
- status: Fixed, Tentative, or Open;
- createdInRound: round in which the Decision first appeared;
- lastUpdatedInRound: most recent revision;
- evidence: the user action, generation trace, or visible cue that caused the Decision to be created.

The following proposed fields are explicitly deferred:

- owner;
- invariant;
- flexibleRange;
- decisionStage;
- Mixed provenance;
- collaborator permissions.

These may be reconsidered when multi-role production handoff is designed.

---

## 7. Decision status

### 7.1 Fixed

Fixed means:

- the Decision has been reviewed;
- the creator intends it to be preserved;
- later storyboard generation must treat it as a constraint;
- downstream production should understand it as important.

Fixed does not mean that the underlying pixels can never change. It means the directorial choice must remain recognizable.

### 7.2 Tentative

Tentative means:

- the Decision has not been reviewed;
- the Decision is still unresolved;
- the current choice may be a placeholder;
- the current choice may be an AI-filled assumption;
- the current choice must not be treated as final.

Tentative is the default for newly introduced AI decisions.

### 7.3 Open

Open means:

- the Decision has been reviewed;
- the creator intentionally leaves implementation flexible;
- later production may vary the choice;
- the Decision is not merely forgotten or unreviewed.

The critical distinction is:

    Tentative = not yet decided
    Open = intentionally left flexible

### 7.4 Default status rules

- New AI-filled choice → Tentative
- General user preference → Tentative unless explicitly confirmed
- Explicit user must-have → Fixed
- Reviewed flexibility → Open

### 7.5 State transitions

Allowed transitions:

~~~text
Tentative → Fixed
Tentative → Open
Fixed → Tentative
Open → Tentative
Open → Fixed
~~~

Transition meanings:

- Tentative → Fixed: choose or pin an option;
- Tentative → Open: deliberately leave flexible;
- Fixed → Tentative: reopen for reconsideration;
- Open → Tentative: bring a flexible element back into active review;
- Open → Fixed: later commit to a concrete choice.

No agent may perform these transitions without an explicit user action.

---

## 8. Provenance

### 8.1 Provenance values

The first implementation uses only:

- User
- AI

### 8.2 Provenance is independent from status

Valid combinations include:

- User + Fixed
- User + Tentative
- User + Open
- AI + Tentative
- AI + Fixed
- AI + Open

Selecting an AI Option changes its status, not its origin.

Example:

    AI proposes a wide shot
    → provenance: AI
    → status: Tentative

    user reviews and pins it
    → provenance: AI
    → status: Fixed

### 8.3 Provenance must come from the event log

Provenance is a recording problem, not a creative interpretation problem.

It must not be assigned by Narrative, Mise-en-scène, Cinematography, or Editing Agents.

System rules:

- user explicitly enters a choice → User;
- user adds, removes, or reorders a panel → User;
- an agent generates an Option → AI;
- image generation fills a detail → AI;
- user accepts an AI Option → AI origin remains;
- user sketch candidate → ask for confirmation before assigning User.

### 8.4 Detecting choices in a hand-drawn panel

A visible feature in a sketch is not automatically a deliberate User Decision.

Example confirmation:

    The character appears at the left edge of shot 2.
    Was this placement intentional?

Possible responses:

- register as a Decision;
- keep as temporary;
- ignore as an unimportant sketch artifact.

Only a confirmed intentional feature enters the Inventory as a User Decision.

### 8.5 Decision discovery and provenance are different

An AI system may discover a candidate in a user sketch. This does not make the underlying Decision AI-originated.

- discovered by: AI
- created through: user sketch
- confirmed as intentional by: user
- provenance: User

Discovery metadata may be stored internally, but it is not the same field as provenance.

---

## 9. Agent hierarchy

### 9.1 Two-level architecture

Narrative is the upper agent.

Mise-en-scène, Cinematography, and Editing are lower implementation agents.

This is the runtime architecture, not the interface metaphor. In the product UI,
only Narrative is presented as an Agent because it directly interprets user
requests and proposes changes. Mise-en-scène, Cinematography, and Editing are
presented as Creative Lenses: three ways to inspect the same scene. Their
underlying services may remain agentic, but the user should not have to manage
four conversational personas.

~~~text
User script and optional intention
              ↓
       Narrative Agent
              ↓
  Mise-en-scène · Cinematography · Editing
              ↓
         Director choice
~~~

### 9.2 Narrative Agent

Responsibilities:

- interpret the script into provisional narrative structure;
- identify story beats;
- propose information reveal order;
- propose a provisional cut scaffold;
- generate high-level narrative questions;
- provide narrative constraints to lower agents;
- reconsider structure when a lower-axis choice changes narrative meaning.

Narrative is not the final authority. The user is.

### 9.3 Mise-en-scène Agent

Responsibilities:

- character and object placement;
- spatial relations;
- blocking and gaze;
- pose and expression;
- background and props;
- visible spatial cues.

### 9.4 Cinematography Agent

Responsibilities:

- shot scale;
- camera angle;
- framing;
- point of view;
- visual inclusion and exclusion;
- camera-based attention control.

### 9.5 Editing Agent

Responsibilities:

- cut division;
- shot order at the implementation level;
- transition;
- pacing and rhythm;
- reaction timing;
- continuity between panels.

### 9.6 Narrative and Editing boundary

Narrative answers:

- what should be known;
- when information should be revealed;
- what story or emotional change each beat carries.

Editing answers:

- how many cuts express that change;
- how long a reaction is held;
- how panels connect;
- how the reveal is experienced through rhythm and transition.

### 9.7 Upward escalation

If a lower-agent Option would alter:

- beat structure;
- information order;
- causal understanding;
- scene-level intention;

the system marks Narrative check.

Narrative may then:

- explain the consequence;
- propose a revised narrative Option;
- update the downstream brief after user approval.

Lower agents do not silently rewrite the Narrative scaffold.

---

## 10. Initial input and Narrative scaffold

### 10.1 Required input

The only required input is a simple script.

The script may contain:

- event description;
- character action;
- dialogue;
- scene notes.

### 10.2 Existing v3 entry point

The existing left Narrative panel is the single entry point for the script.

SceneLens must not add a separate script input flow for the Narrative Agent.

The current interaction is retained:

1. the user opens `Edit Script` in the left panel;
2. the user pastes or edits the screenplay;
3. `Apply to Storyboard` stores the screenplay;
4. the left panel renders the script grouped by Beat;
5. the user can manually use `Split Beat` and `Merge`.

`Apply to Storyboard` saves the script. It must not silently accept an AI-generated
Beat or cut structure.

After the script is saved, Narrative may offer a separate provisional structure.
The existing manual Beat controls remain available before and after that proposal.

### 10.3 Optional input

Directorial intention is optional.

Suggested user-facing prompts:

- What should viewers understand or feel?
- Is there anything that must be preserved?
- Skip if this is not decided yet.

The user must be able to start with the script alone.

The optional intention belongs to the same left-panel Narrative flow. It may be
collapsed or skipped and must not become a second required form.

### 10.4 AI-proposed intention

If the user does not provide an intention, Narrative may propose a provisional reading.

Example:

    Provisional Narrative interpretation:
    This scene appears to emphasize the repetition and fatigue of daily life.
    Is that close to what you want?

This is AI + Tentative.

It must not be treated as the user's original intention.

### 10.5 Narrative output

Narrative produces:

- short scene summary;
- provisional beats;
- information reveal sequence;
- provisional cut count and order;
- short textual purpose for each cut.

This output is a proposal layered over the stored screenplay. It does not replace
the screenplay and does not create final storyboard panels by itself.

### 10.6 User confirmation flow

Recommended left-panel flow:

~~~text
Edit Script
  → Apply to Storyboard
  → Propose Beat & Cut Structure
  → inspect Narrative draft
  → adjust with Split / Merge / Add or remove provisional cuts
  → Accept Scaffold
  → choose Blank / Draw / Generate / Import per panel
~~~

The user must be able to:

- accept the full scaffold;
- accept selected Beats or cuts;
- manually revise the proposal;
- discard it and continue from the script alone.

The Narrative proposal must be visually distinguishable from the accepted
screenplay and storyboard state.

Before acceptance, Split and Merge actions operate on the Narrative draft, not
on the accepted screenplay-to-shot mapping. The existing Split/Merge visual
language may be reused, but draft commands and accepted-state commands must be
separate internally.

Every screenplay element needs a stable ID. Narrative output refers to those IDs
rather than copying text or relying only on array indexes. A proposal also records
the screenplay revision it analyzed so that stale proposals cannot overwrite a
newer script.

### 10.7 Beat and cut are different

A Beat is a narrative, emotional, or informational change.

A Cut is a visual panel used to present one or more changes.

- one Beat may use several cuts;
- one cut may contain several small Beat changes;
- the mapping remains Tentative until reviewed.

---

## 11. Hybrid initial board construction

Narrative generates the board scaffold, not necessarily every image.

After the scaffold, the user chooses how to construct the board.

Global starting options:

- start with empty panels;
- generate selected panels;
- generate all panels as an AI draft.

Per-panel construction options:

- hand draw;
- AI generate;
- enhance a sketch;
- import an image;
- leave blank.

Example hybrid board:

- shot 1: hand-drawn;
- shot 2: AI-generated;
- shot 3: hand-drawn and enhanced;
- shot 4: blank.

Round 0 is the initial board assembled from the scaffold and these construction choices.

The system must not imply that all panels need equal detail or completion.

---

## 12. Selection target and application scope

### 12.1 Do not mix Range and Boundary as the same category

Range describes quantity or extent.

Boundary describes the kind of target: a transition between panels.

They should not be peer values in one scope enum.

### 12.2 Target types

The UI uses direct storyboard selection:

- one panel;
- multiple panels;
- one transition between panels;
- multiple transitions;
- the whole scene.

The user should not need to select technical labels such as Range or Boundary.

### 12.3 Interaction

- click a panel → one panel;
- drag across panels → multiple panels;
- click the space between panels → a transition;
- select the scene header → the whole scene.

### 12.4 User focus versus Option application

The user's selection is a focus for discussion, not always the final application scope.

Example:

    user selects shot 3 and asks to strengthen isolation

Possible Options:

- Cinematography: modify shot 3 framing;
- Mise-en-scène: modify character distance across shots 2 and 3;
- Editing: change the transition from shot 3 to shot 4.

Each Option must show its own proposed target.

### 12.5 Direct and affected targets

The interface may distinguish:

- direct target: panels or transitions the Option changes;
- affected target: nearby panels that may require continuity review.

Suggested visual language:

- solid highlight: direct application;
- dotted highlight: possible downstream impact.

The user confirms or edits the proposed target before applying the round.

---

## 13. Decision Inventory construction

The Inventory uses two sources.

### 13.1 Deterministic action records

The system can directly record:

- script input;
- explicit constraints;
- panel creation and deletion;
- reordering;
- manual changes;
- selected AI Options;
- generation requests.

### 13.2 Candidate extraction

The system may detect candidate decisions from:

- generated images;
- imported images;
- hand-drawn panels;
- relationships across panels.

Candidate extraction does not automatically make a formal Decision.

Candidates should be phrased as review prompts.

Example:

    Shot 2 appears to place the character at the edge of the frame.
    Was this placement intentional?

### 13.3 Candidate filtering

The system should surface only choices likely to affect:

- story understanding;
- emotion;
- attention;
- production guidance;
- continuity;
- meaningful spatial or visual relations.

Decorative details with no likely directorial consequence should not flood the Inventory.

### 13.4 Inventory organization

Inventory is organized by directorial axis.

Application target is shown separately on the storyboard timeline.

~~~text
Narrative layer
  narrative Decisions and Beat structure

Mise-en-scène lane
  Decision cards aligned to panels

Cinematography lane
  Decision cards aligned to panels

Editing lane
  Decision cards aligned to transitions
~~~

Axis answers:

    What kind of directorial choice is this?

Target answers:

    Where does this choice apply?

---

## 14. Decision question generation

Decision questions may come from three sources.

### 14.1 User-originated question

The user selects a panel or scene and asks a question.

Example:

    Should the face be shown closer here?

The relevant agent normalizes this into a comparable Decision topic.

### 14.2 Narrative question

Narrative generates high-level questions.

Examples:

- When should the airport be revealed?
- How many Beats should the shift from fatigue to relief contain?
- What should the viewer know before shot 3?

### 14.3 Lower-agent question

A lower agent converts an AI + Tentative current choice into a review question.

Example:

    The initial board uses a wide shot in shot 2.
    Should this camera distance be preserved?

### 14.4 Narrative sends constraints, not every question

Narrative should not author every lower-axis question.

Example Narrative constraint:

    The airport must not be clearly revealed before the final Beat.

Lower agents translate the constraint:

- Mise-en-scène: which airport cues should remain visible?
- Cinematography: what framing avoids early disclosure?
- Editing: at which transition should the wide reveal occur?

### 14.5 Question priority

Questions should not appear all at once.

Priority order:

1. user-created question;
2. high-impact Narrative question;
3. Tentative choices affecting several panels;
4. AI-filled choices that affect reading or production;
5. remaining details.

Default round workload:

- two or three active questions;
- additional questions available on demand.

---

## 15. Option Set and Option Card

### 15.1 Option Set

Options are grouped under one Decision topic.

Example:

    Decision topic:
    Camera distance in shot 2

    Current choice:
    Wide shot
    AI · Tentative · shot 2

The current choice must appear beside alternatives.

### 15.2 Number of Options

Default:

- current choice;
- two meaningfully contrasting alternatives.

Avoid many near-duplicate Options.

### 15.3 Required Option Card content

Each Option shows:

- title;
- concrete proposal;
- expected effect;
- cost or trade-off;
- direct application target;
- affected targets if relevant;
- Preview action.

### 15.4 Option actions

Primary actions:

- Preview: temporary comparison;
- Choose: select and move the Decision to Fixed;
- Adapt: create a user-edited version.

Decision-level actions:

- Keep Tentative;
- Leave Open.

Secondary behavior:

- Exclude an irrelevant Option;
- Combine appears only when two compatible Options are selected.

Rejecting an Option must not automatically delete the Decision topic.

### 15.5 Preview

Preview is temporary.

It must not:

- create a Board version;
- change status;
- overwrite Fixed choices.

Preview may be:

- image comparison;
- overlay;
- rough regeneration;
- textual or thumbnail plan when generation is expensive.

---

## 16. Cross-agent response

Cross-agent response occurs after the user previews or shortlists an Option.

Agents do not produce open-ended conversation transcripts.

Response types:

- Supports: reinforces another axis;
- Trade-off: weakens or obscures another effect;
- Narrative check: changes Beat, information order, or causal meaning.

Rules:

- only relevant agents respond;
- one concise response per relevant agent;
- responses must reference the concrete Option;
- responses do not change the Option automatically;
- the user decides whether to revise, choose, or ignore.

Example:

    Option: Close-up in shot 2

    Mise-en-scène · Trade-off
    Background airport cues may disappear.

    Editing · Supports
    A later cut to a wide frame could strengthen the reveal.

    Narrative check
    Reconsider when the airport becomes legible.

---

## 17. Round model

### 17.1 Round definition

A Round includes:

1. focus selection;
2. Decision question review;
3. Option preview and selection;
4. cross-agent consequence review;
5. round plan confirmation;
6. storyboard generation or update;
7. before-and-after comparison;
8. Decision Inventory update.

### 17.2 Round plan

Before applying, show the user a summary.

Example:

    Round 2: strengthen isolation across shots 2 to 4

    Fixed
    - keep shot 2 wide
    - place the character near the frame edge

    Open
    - exact background props

    Tentative
    - add a reaction close-up in shot 3

### 17.3 Apply to storyboard

The user confirms the round with one explicit action.

Option Preview and Apply to Storyboard are different actions.

### 17.4 Selective regeneration

Default:

- regenerate only direct targets;
- inspect affected targets for continuity;
- preserve unrelated panels;
- use Fixed Decisions as generation constraints.

Narrative changes may require:

- panel addition;
- panel deletion;
- panel reordering;
- broader scene regeneration.

The user must see and approve the broader target before applying.

### 17.5 Open and Tentative details in generated pixels

An image model may need to render a concrete visual detail even when its Decision is Open or Tentative.

Rendering a detail does not change its commitment status.

The interface must continue to show that the visible implementation is nonbinding.

### 17.6 Manual edits during a round

Hand drawing and direct edits may occur before the round is applied.

These actions enter the round plan as User-originated changes and are included in the resulting Board version.

---

## 18. Viewer Reflection pipeline

### 18.1 Revised position

The earlier concept of N independent Viewer Agents and an interpretation distribution is removed from the core design.

The core system does not claim:

- N model calls equal N viewers;
- model frequencies estimate viewer percentages;
- repeated samples form a human interpretation distribution.

### 18.2 Purpose

Viewer Reflection helps the creator inspect:

- one possible intention-blind sequential reading;
- alternative readings supported by visible cues;
- where interpretations can diverge;
- which claims are visible and which require additional inference.

### 18.3 Trigger

Viewer Reflection is available:

- after a round produces a readable Board version;
- on demand.

If the board contains blank or unreadable panels, the system should not imply that full-scene reading is reliable. The user may:

- select a readable subset;
- wait until later;
- provide only audience-available dialogue or sound annotations.

### 18.4 Viewer input

Allowed:

- rendered panels;
- panel order;
- dialogue;
- sound annotations available to an eventual audience.

Blocked:

- creator intention;
- Narrative reasoning;
- agent reasoning;
- Option effect and cost;
- status and provenance;
- internal prompts.

### 18.5 Optional intention snapshot

Before running Viewer Reflection, the interface may ask:

    How do you currently hope this scene will be read?

This is optional.

The snapshot is stored beside the report but never passed into Viewer analysis.

If the user skips it, the report remains useful without an intention comparison.

### 18.6 Stage A: Blind Sequential Reading

Panels are presented cumulatively.

For each step:

- describe what appears to be happening;
- explain what new information changes;
- preserve the evolving interpretation within this one reading;
- finish with a whole-scene reading.

Output name:

- Initial Reading

Initial does not mean correct, dominant, or representative.

### 18.7 Stage B: Alternative Reading Explorer

Generate up to two meaningfully different readings that:

- remain plausible from the presented board;
- identify where they diverge from the Initial Reading;
- avoid inventing unsupported external context;
- state what additional inference is required.

These are possible reading paths, not simulated audience members.

### 18.8 Stage C: Cue Trace

For every reading:

- cite relevant panels;
- list visible cues;
- list inferred assumptions separately;
- identify the first divergence point;
- state whether later panels resolve the divergence.

The system should expose raw reading text so the user can inspect the synthesis.

### 18.9 Viewer output

The UI presents:

- optional creator intention snapshot;
- Initial Reading;
- up to two Alternative Readings;
- first divergence point;
- visible cues per reading;
- additional model inference;
- ambiguity resolved or unresolved by the final panel;
- relevant directorial axes.

Do not present:

- audience percentages;
- accuracy scores;
- intention-match scores;
- claims about real viewer populations.

### 18.10 Cue-based routing

Routing rules:

- information order or reveal timing → Narrative;
- on-screen element, prop, pose, blocking, background → Mise-en-scène;
- framing, shot scale, angle, visibility → Cinematography;
- transition, cut timing, sequence, rhythm → Editing.

Viewer Reflection suggests a route but does not call an agent or change the board automatically.

User action:

- keep as intended;
- accept the ambiguity;
- create a Decision question;
- reopen a related Decision;
- ignore.

### 18.11 Persona policy

Core Viewer Reflection uses no personas.

Persona-conditioned exploration is deferred as a separate optional Perspective Probe.

Any future Perspective Probe must:

- remain separate from core Viewer results;
- not be described as a real demographic sample;
- not contribute to population percentages.

### 18.12 Defensible system claim

Recommended claim:

    SceneLens does not predict audience response.
    It externalizes multiple cue-grounded reading paths from the current storyboard
    so that creators can notice possible ambiguity and reflect on visible evidence.

---

## 19. UI information architecture

### 19.1 Commitment-level views

Use cumulative views over the same Decision data.

#### Production

Shows:

- Fixed only.

Purpose:

- communicate decisions that should be preserved in downstream production.

#### Review

Shows:

- Fixed;
- Tentative.

Purpose:

- active decision work;
- expose unreviewed AI-filled assumptions.

This is the default authoring view.

#### Full

Shows:

- Fixed;
- Tentative;
- Open.

Purpose:

- inspect the complete commitment map;
- understand deliberate flexibility.

### 19.2 Status visibility

Even when filtered, counts remain visible.

Example:

    Fixed 4 · Tentative 7 · Open 3

Open Decisions must not disappear without an indicator.

### 19.3 Status visual language

Suggested:

- Fixed: solid structure, pin or check;
- Tentative: visible review emphasis, not an error color;
- Open: clear open-state marker, not faded into irrelevance.

### 19.4 Main workspace hierarchy

Suggested layout:

1. Narrative layer at the top;
2. storyboard timeline and canvas;
3. lower-axis Decision lanes;
4. active Decision and Option Set;
5. round plan tray;
6. Viewer Reflection as a post-round view.

### 19.5 Collaborative motivation of Open

Open supports the idea that a storyboard communicates across:

- director;
- writer;
- cinematographer;
- actor;
- production design;
- editor.

The first implementation records Open without role ownership.

Role-specific handoff views and delegated authority are deferred until the minimal Decision workflow is validated.

---

## 20. End-to-end pipeline

~~~text
0. Script input
   required: simple script
   optional: intention and must-have elements

1. Narrative scaffold
   scene summary
   Beats
   reveal order
   provisional cut structure

2. Hybrid board construction
   empty panel
   hand draw
   AI generation
   sketch enhancement
   import

3. Round 0 Board
   initial hybrid storyboard

4. Decision Inventory
   event-log Decisions
   AI-filled candidates
   user-confirmed sketch candidates

5. Decision questions
   Narrative questions
   lower-axis questions
   user-created questions

6. Option Sets
   current choice
   contrasting alternatives
   effect
   cost
   scope
   Preview

7. Cross-agent response
   Supports
   Trade-off
   Narrative check

8. Round plan
   Fixed
   Tentative
   Open
   direct and affected targets

9. Apply to Storyboard
   selective regeneration
   manual changes included
   Fixed constraints preserved

10. New Board version
    before and after comparison
    Inventory update

11. Viewer Reflection
    Blind Sequential Reading
    Alternative Reading Explorer
    Cue Trace

12. Creator reflection
    keep
    accept ambiguity
    open Decision question
    reopen Decision

13. Next round
~~~

---

## 21. Suggested system components

### 21.1 Narrative service

Produces:

- Beat scaffold;
- information sequence;
- provisional cuts;
- narrative questions;
- narrative checks.

### 21.2 Decision Inventory manager

Acts as the source of truth for:

- Decision IDs;
- provenance;
- status;
- targets;
- evidence;
- round creation and revision.

This is a system service, not a creative agent.

### 21.3 Event logger

Records:

- user actions;
- agent proposals;
- generation calls;
- preview;
- round application;
- status transitions.

Provenance is derived from this record.

### 21.4 Axis agents

- Mise-en-scène;
- Cinematography;
- Editing.

They create questions, Options, effects, costs, and concise cross-axis responses.

### 21.5 Board renderer and editor

Supports:

- hand drawing;
- selective generation;
- enhancement;
- import;
- overlays;
- before-and-after comparison;
- targeted update.

### 21.6 Round manager

Maintains:

- active selections;
- selected Options;
- user edits;
- round plan;
- affected targets;
- Board versions.

### 21.7 Viewer Reflection service

Runs:

- Blind Sequential Reading;
- Alternative Reading Explorer;
- Cue Trace;
- cue-based routing suggestions.

It receives no creator intention or agent reasoning.

---

## 22. System invariants

The implementation must preserve the following rules.

1. Every formal Decision has an axis, target, provenance, and status.
2. Provenance is assigned by system records, not agent opinion.
3. User acceptance of an AI Option does not rewrite its origin as User.
4. Tentative and Open are never treated as equivalent.
5. Open means reviewed flexibility, not accidental omission.
6. The current generated result appears as an Option, not a privileged default.
7. Agent discussion is structured, concise, and Option-specific.
8. Narrative is above the three implementation agents.
9. Lower agents may request Narrative review but cannot rewrite Narrative automatically.
10. Preview never creates a Board version or status transition.
11. A Round is created only when the user applies a round plan.
12. Fixed Decisions are explicit generation constraints.
13. Regeneration must not silently expand its target.
14. Viewer Reflection never receives creator intention.
15. Viewer output is not described as a human audience distribution.
16. Viewer output never changes the storyboard automatically.

---

## 23. MVP recommendation

### Phase 1: core Decision loop

- script input;
- optional intention;
- Narrative scaffold;
- hybrid board creation using existing drawing and generation tools;
- minimal Decision model;
- User and AI provenance;
- Fixed, Tentative, Open;
- panel and transition targeting;
- manual Decision creation;
- event-log-based Decision creation;
- one Option Set at a time;
- Preview;
- round plan;
- selective storyboard update;
- version comparison.

### Phase 2: structured agent collaboration

- all three lower agents;
- automatic lower-axis question generation;
- Supports and Trade-off responses;
- Narrative check;
- improved target impact detection.

### Phase 3: Viewer Reflection

- intention-blind sequential reading;
- alternative reading exploration;
- cue trace;
- routing into a new Decision question;
- raw reading inspection.

### Deferred extensions

- owner and delegated role;
- invariant and allowed variation;
- decision deadline or production stage;
- role-specific production handoff;
- collaborative comments and permissions;
- Mixed provenance;
- persona-based Perspective Probe;
- automatic interpretation frequency claims;
- automatic population simulation.

---

## 24. Current v3 prototype gaps

The current v3 Decision Board is a visual prototype rather than an implementation of this specification.

Known gaps:

- Narrative is currently displayed as a peer of the other agents;
- agent content is largely mock data;
- the Decision model is not a persistent source of truth;
- status and provenance do not drive generation;
- Option cards are not organized under canonical Decision topics;
- cross-agent interaction resembles debate more than structured consequence reporting;
- round planning and versioned application are missing;
- the existing storyboard and Decision Board are not yet integrated as one workflow;
- Viewer Reflection is not implemented;
- current UI does not distinguish Production, Review, and Full views.

Required conceptual refactor:

~~~text
Current
  four peer lenses
  static mock Options
  debate transcript

Target
  Narrative upper layer
  three lower implementation agents
  persistent Decision Inventory
  Decision-centered Option Sets
  structured cross-agent responses
  round-based Board generation
  cue-grounded Viewer Reflection
~~~

---

## 25. Recommended implementation order

1. Keep the existing left Narrative panel as the script source of truth.
2. Define and display a provisional Narrative scaffold without overwriting the screenplay.
3. Let the user accept, revise, or discard proposed Beats and cuts.
4. Connect an accepted scaffold to provisional blank shots.
5. Preserve the existing hand-drawing and generation pathways as per-panel construction methods.
6. Define Decision, Option, target, Round, and Board-version data structures against that user flow.
7. Add event logging and provenance assignment.
8. Build Inventory UI with status and axis grouping.
9. Build panel and transition selection.
10. Build one complete Cinematography Decision and Option Set after the Narrative flow is stable.
11. Add round plan and selective regeneration.
12. Add Mise-en-scène and Editing using the same Decision protocol.
13. Add Narrative check and replace debate transcripts with structured cross-agent responses.
14. Add Production, Review, and Full views.
15. Implement Viewer Reflection after the round workflow is stable.

The first vertical slice should prove:

    existing left-panel script
    → provisional Narrative Beats and cuts
    → user review and revision
    → accepted scaffold
    → Blank / Draw / Generate / Import choices per panel
    → initial hybrid Board

---

## 26. Evaluation framing

The system should not be evaluated primarily on whether AI predicts real audience reactions.

More appropriate questions:

- Does the system help creators notice meaningful AI-filled choices?
- Can users distinguish satisfaction, unresolved assumptions, and intentional openness?
- Do Option Sets help users consider alternatives without surrendering authorship?
- Does round-based application make storyboard revision understandable?
- Does Viewer Reflection help creators notice visible cues and inference gaps?
- Can users explain what should remain fixed and what may change in production?
- Does the system support movement between hand drawing and AI generation without forcing a uniform workflow?

Human viewer studies are required before making claims about real audience interpretation.

---

## 27. Decisions currently treated as settled

- Narrative is the upper agent.
- Mise-en-scène, Cinematography, and Editing are lower agents.
- Script is required; intention is optional.
- Narrative creates a scaffold, not necessarily all panel images.
- Board construction can mix drawing, AI generation, enhancement, import, and blank panels.
- Decision status uses Fixed, Tentative, and Open.
- Provenance initially uses User and AI.
- Provenance comes from event logs, not agent judgment.
- Axis and application target are separate.
- Range and transition are not peer scope categories.
- Decision questions may come from the user, Narrative, or a relevant lower agent.
- Options are grouped beneath one Decision topic.
- The current choice appears beside alternatives.
- One round applies a batch of choices to generate a new Board version.
- Viewer analysis is reflection, not audience simulation.
- Core Viewer analysis uses no personas.
- N-call interpretation distributions are removed from the core claim.

---

## 28. Questions intentionally left open

- Exact data representation for combined or heavily revised Options
- Whether provenance should later include Mixed or Derived
- How to represent role delegation for Open Decisions
- Whether Open Decisions need explicit invariants
- How many Decision questions should appear for long scenes
- How much visual candidate extraction is reliable for rough sketches
- Whether Viewer Reflection should operate on a selected range or always on a complete scene
- How to represent incomplete or unreadable panels during reflection
- How to export Fixed Decisions as a production handoff artifact
- How to validate model-generated reading paths against human viewers

These questions should not block the first core Decision-loop implementation.
