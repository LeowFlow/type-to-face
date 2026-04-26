const MONOSPACE_SYSTEM_STACK = '"SFMono-Regular", Menlo, Consolas, monospace';

export const DEFAULT_FONT_FAMILY = `"IBM Plex Mono", ${MONOSPACE_SYSTEM_STACK}`;

export const FONT_FAMILY_OPTIONS = [
  {
    label: "IBM Plex Mono",
    loadFamily: '"IBM Plex Mono"',
    value: DEFAULT_FONT_FAMILY,
  },
  {
    label: "JetBrains Mono",
    loadFamily: '"JetBrains Mono"',
    value: `"JetBrains Mono", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Fira Code",
    loadFamily: '"Fira Code"',
    value: `"Fira Code", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Source Code Pro",
    loadFamily: '"Source Code Pro"',
    value: `"Source Code Pro", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Cascadia Mono",
    loadFamily: '"Cascadia Mono"',
    value: `"Cascadia Mono", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Ubuntu Mono",
    loadFamily: '"Ubuntu Mono"',
    value: `"Ubuntu Mono", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Inconsolata",
    loadFamily: '"Inconsolata"',
    value: `"Inconsolata", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Space Mono",
    loadFamily: '"Space Mono"',
    value: `"Space Mono", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "Roboto Mono",
    loadFamily: '"Roboto Mono"',
    value: `"Roboto Mono", ${MONOSPACE_SYSTEM_STACK}`,
  },
  {
    label: "System Monospace",
    loadFamily: "ui-monospace",
    value: `ui-monospace, ${MONOSPACE_SYSTEM_STACK}`,
  },
];

export function getFontLoadFamily(fontFamily) {
  return (
    FONT_FAMILY_OPTIONS.find((entry) => entry.value === fontFamily)?.loadFamily ||
    fontFamily.split(",")[0]?.trim() ||
    "monospace"
  );
}
