# CampaignTwin UI verification

The requested visual reference is ChatGPT’s dark workspace. The design uses a deep black canvas, a neutral gray type hierarchy, solid composer and fields, and text labels for actions. The text and black/gray palette are based on the public OpenAI Apps SDK UI foundations. The product retains the CampaignTwin name. The original supplied pixel prototype informed the Arena’s market square, top-down viewpoint and three-column layout. [OpenAI grayscale tokens](https://github.com/openai/apps-sdk-ui/blob/0f00143c7a639906f1621fe58e1b6be7b5bea46d/src/styles/variables-primitive.css)

## Review findings and changes

| Area | Interaction and evidence |
|---|---|
| Plan | Only the conversation and the editable campaign form occupy the workspace. Source quotes, blockers and explicit approval appear where the planner acts on them. The chat supports Enter to send and Shift+Enter for a new line. Failed writes leave the composition editable. |
| Field ownership | The connected form sends planner intent. The selected catalog entry and verified or assumed evidence remain server-owned. The client follows the revision returned after a chat reply. [Field mapping](backend-v1-handoff.md) |
| Arena | A central market sits between the plan and evidence panels. The demo groups purchases by the selected frame’s brand groups and shows shoppers who made no purchase separately. On smaller screens the market is placed first. A common view switch selects the modeled isometric market, original 2D market or campaign workflow. Scenario alternatives appear together above the metrics. The synthetic rehearsal includes selectable shoppers. The API workspace uses actual evaluated scenarios and displays the limits on individual shopper data. |
| Workflow | The diagram fills the Arena width. Connected nodes show the brief, reviewed terms, plan branches, simulated activity, measurements, checks and decision. The recorded values appear in the corresponding nodes. Users can switch plans, advance the demo checkpoint or open Verdict inside the diagram. |
| Shopper inspection | Users can tap a shopper, navigate the canvas with arrow keys and Enter, find an ID, inspect a switcher, or choose a cohort. The inspector opens with identity and the current day’s decision. Traits, memory and the event history expand on request. Controls follow shopper identity across the timeline. The group filters and detailed evidence are reachable with a keyboard. |
| Motion | Shoppers follow routes with staggered departures and a bounded walking cadence. The timeline interpolates its playhead between recorded days. Desktop wheel scrolling eases to a stop, while touch scrolling stays native. The workspace honors reduced motion and stops scheduling scroll animation frames at rest. |
| Verdict | The dashboard plots P10–P90 incremental profit after costs across evaluated plans on one THB scale. A median marker, zero reference and exact-value table make gains and losses comparable. A single accented median highlights the decision. Missing values retain their source reason. |

## Browser checks

Chromium checks covered the fixture brief and quotes, manual edits and renewed confirmation, answering questions, explicit approval, map pointer and keyboard selection, scenario switching, baseline overlay, timeline checkpoints, and the return from Verdict. Layouts were checked between 320 px and 1440 px. Automated axe scans found no violations in the tested fixture views. These checks cover specific states and viewport sizes.

The Arena walkthrough also covered a five-group sample with two competitors, a group with zero buyers, a repeated shopper ID and incomplete waiting data. The two map views, inspector and workflow preserved the same 187 distinct shoppers. A legacy preference-only replay showed purchase outcomes as unavailable.

The production Chromium walkthrough exercised all ten v1 operations on backend `dev@fd13e63`, including a follow-up, review reload, confirmation, approval and the three report evidence reads. Browser checks covered positive and negative profit, a zero baseline, exact percentiles, keyboard navigation, desktop wheel interpolation and enabling reduced motion at runtime. The connected handoff records the full backend suite result. The synthetic policy is a rehearsal of the submitted terms. Commercial seller evidence and a live shopper trace feed remain backend integration questions.

The project’s campaign UI, Playwright, debugging and code-review skills live in `.agents/skills/`.
