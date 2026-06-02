export const LOGICAL_WIDTH  = 1920;
export const LOGICAL_HEIGHT = 1080;

export const Lane = Object.freeze({ TOP: 0, MID: 1, BOT: 2 });

export const LANE_Y = Object.freeze({
  [0]: LOGICAL_HEIGHT * 0.30,
  [1]: LOGICAL_HEIGHT * 0.55,
  [2]: LOGICAL_HEIGHT * 0.78,
});

export const LANE_MULTIPLIER = Object.freeze({
  [0]: 1.0,
  [1]: 1.2,
  [2]: 1.5,
});
