type IconPathsBySize = Record<number, string>;

const ACTION_ICON_ON: IconPathsBySize = {
  16: "assets/rook2-16.png",
  32: "assets/rook2-32.png",
  48: "assets/rook2-48.png",
  128: "assets/rook2-128.png",
};

const ACTION_ICON_OFF: IconPathsBySize = {
  16: "assets/grey-rook2-16.png",
  32: "assets/grey-rook2-32.png",
  48: "assets/grey-rook2-48.png",
  128: "assets/grey-rook2-128.png",
};

export function getActionIconPaths(enabled: boolean): IconPathsBySize {
  return enabled ? ACTION_ICON_ON : ACTION_ICON_OFF;
}
