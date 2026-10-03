# Interface design contract

**Product:** a document assistant for people who want to inspect evidence, plus an evaluation and internal review workspace.

**Primary action:** ask a document question, inspect its source, and send an unsupported request to a person. **Trust surface:** visible page/version references, actual fixture results, original text, and recorded human approval.

**Selected direction:** Graphite & Tangerine. Use a dark editorial canvas, warm apricot actions, a floating navigation rail, open metric typography, a continuous evaluation chart, source links at the point of reading, and one contextual inspector. Document lists and case rows carry the real information hierarchy.

| Theme | Background | Surface | Text | Accent |
|---|---|---|---|---|
| Graphite & Tangerine — default | `#151719` | `#22262A` | `#FAF8F5` | `#FFB67A` |
| Midnight & Mint | `#101A24` | `#192A37` | `#EDF8F5` | `#7DE0C3` |
| Ivory & Cobalt | `#F6F3ED` | `#FFFFFF` | `#17213D` | `#3156D3` |
| Sage & Forest | `#EDF2EC` | `#F8FAF6` | `#19392C` | `#2D6A4F` |

Subtle page/source transitions, an animated navigation indicator, chart transitions and indexing states make changes legible. System reduced-motion preferences and a persistent user toggle suppress motion. Small screens use bottom navigation and stack the inspector below the reading area. Drawers isolate background controls and support Escape/focus cycling. Loading, empty, failed-import, denied-role, and stale-review states are part of the product.

Charts contain measured completed runs. Source panels show actual retrieved text. No decorative confidence gauges, invented run history, placeholder citations or fictional success totals appear in the working interface. Screenshots in this repository are captures of the running app.
