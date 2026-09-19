# Tipsy Trouble interface

## Direction

A shared-phone party game should get people into the next turn quickly. Keep the navy surface quiet, use coral for the main action, and reserve lime for supporting emphasis. The two-card-and-spark mark is the app identity: use `public/icon.svg` in the shell and regenerate install icons with `npm run icons:generate`.

Home presents one play action and a visible Library entry. Library separates saved players, custom cards and backups through route links. Setup selects and orders the roster. During play, put the player, card and next action ahead of optional rules and other navigation. Keep long lists, editors and explanations out of the initial view until requested.

## Foundations

`src/shared/styles/main.css` is the source of truth for colors, spacing, radii and shared controls. Use `--ink`, `--cream`, `--muted`, `--coral`, `--lime`, `--line` and `--panel` by role. Use the `--space-*` scale for spacing and `--radius-sm`, `--radius` and `--radius-lg` for shape. Keep screen-specific composition in scoped component styles.

Use the local system font stack; no remote fonts, icon scripts or stylesheets are required. Make headings concise and labels sentence case. Body copy supports the current decision. Use one strong visual focal point per screen and avoid repeating metadata as badges. Decorative artwork may disappear on small screens; actions and essential game content may not.

## Shared components

| Component          | Contract                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppButton`        | `primary`, `secondary`, `danger` and `quiet` variants; defaults to `type="button"`; `loading` disables the control and sets its busy state.                                      |
| `AppDialog`        | Controlled `open`, `title`, `confirmLabel`, optional `cancelLabel`, `busy`, `danger`, `returnFocus`; emits `confirm` or `close`; default slot supplies the confirmation message. |
| `AppIcon`          | Local SVG paths, a typed `name` and optional `size`; decorative icons are hidden from assistive technology. Give icon-only controls their own accessible label.                  |
| `AppSectionHeader` | `title`, optional `description`, and an action slot.                                                                                                                             |
| `LibraryTabs`      | `active` section; normal route links preserve usable history and direct navigation.                                                                                              |
| `PlayerAvatar`     | Shared player image and initials rendering.                                                                                                                                      |

Shared CSS supplies fields, panels, status messages, stacks and navigation links. Links that navigate use the button classes when visually prominent; actions use buttons. Avoid introducing one-off controls for an existing interaction.

## Interaction and accessibility

Controls have at least a 44-pixel height, visible keyboard focus and readable labels. Confirmation dialogs use native `showModal()` to make background content inert. Focus begins on Cancel, Escape requests closure, and closure restores the invoking control when it still exists. Pass the click target or form submitter as `returnFocus`; pointer activation does not focus buttons in every browser. While saving, both actions and Escape cancellation are disabled. Keep confirmation messages brief so the dialog description can be announced as one passage.

Layouts must work at 320, 360, 768 and 1280 pixels without horizontal overflow. The game header stays compact and does not compete with the turn heading. Respect reduced-motion preferences. Keep bundled assets available offline and verify flows in Firefox as well as Chromium.

## References

- [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md): intentional visual hierarchy, cohesive reusable styling and responsive detail.
- [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): contained keyboard focus, least destructive initial action and focus restoration.
- [MDN dialog element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog): native modal behavior and dialog labeling.
