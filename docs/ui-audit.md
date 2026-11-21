# CampaignTwin UI verification

The requested visual reference is ChatGPT’s dark workspace. The design uses a deep black canvas, a neutral gray type hierarchy, solid composer and fields, and text labels for actions. The text and black/gray palette are based on the public OpenAI Apps SDK UI foundations. The product retains the CampaignTwin name. The original supplied pixel prototype provides the Arena’s four stalls, top-down viewpoint and three-column layout. [OpenAI grayscale tokens](https://github.com/openai/apps-sdk-ui/blob/0f00143c7a639906f1621fe58e1b6be7b5bea46d/src/styles/variables-primitive.css)

## Review findings and changes

| Area | Interaction and evidence |
|---|---|
| Plan | Only the conversation and the editable campaign form occupy the workspace. Source quotes, blockers and explicit approval appear where the planner acts on them. The chat supports Enter to send and Shift+Enter for a new line. Failed writes leave the composition editable. |
| Field ownership | The connected form sends planner intent. The selected catalog entry and verified or assumed evidence remain server-owned. The client follows the revision returned after a chat reply. [Field mapping](backend-v1-handoff.md) |
| Arena | A plan rail, central four-stall market, and evidence rail restore the original composition. On smaller screens the market is placed first. A common view switch selects the modeled isometric market, original 2D market or campaign workflow. Scenario alternatives appear together above the metrics. The synthetic rehearsal includes selectable shoppers. The API workspace uses actual evaluated scenarios and displays the limits on individual shopper data. |
| Shopper inspection | Users can tap a shopper, navigate the canvas with arrow keys and Enter, find an ID, inspect a switcher, or choose a cohort. The inspector opens with identity and the current day’s decision. Traits, memory and the event history expand on request. Controls follow shopper identity across the timeline. The preference groups and more detailed evidence are reachable with a keyboard. |
| Motion | The pixel renderer reuses a painted background and sprite atlas. When replaying a frame change, it routes shoppers around buildings. A paused, settled map requires no continuous rendering; reduced motion skips interpolated movement. |
| Verdict | The synthetic verdict retains its original decision, comparison, scenario downside, guardrails and held-out evidence. The connected verdict uses the server’s decision and its original, smaller-discount and no-campaign results. Profit and risk use signed values, semantic colors and explicit labels. Rates include their available sample basis. Rate differences use percentage points. Missing outcomes and reasons stay explicit. |

## Browser checks

Chromium checks covered the fixture brief and quotes, manual edits and renewed confirmation, answering questions, explicit approval, map pointer and keyboard selection, scenario switching, baseline overlay, timeline checkpoints, and the return from Verdict. Layouts were checked between 320 px and 1440 px. Automated axe scans found no violations in the tested fixture views. These checks cover specific states and viewport sizes.

See the backend handoff for the connected-flow verification and tested backend revision. The synthetic policy is a rehearsal of the submitted terms. Commercial seller evidence and a live shopper trace feed remain backend integration questions.

The project’s campaign UI, Playwright, debugging and code-review skills live in `.agents/skills/`.
