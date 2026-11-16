// Colours shared by the street, runner, props and effects. The beaver, wood, tile and paper colours come from
// Learn's palette so the run and Learn cannot drift apart.
import { P } from '../../learn/art';

export { P };

/** Answer lanes left to right: blue, purple, amber. Must equal --lane0..2 in src/ui/styles.css (the answer cards). */
export const LANE_COLOURS: [string, string, string] = ['#4cc9f0', '#b388ff', '#ffb703'];

/** Hazards sit on a red pad with a red-and-black band; one glance tells them from rewards. */
export const HAZARD_RED = '#d7322b';
export const HAZARD_BLACK = '#161622';

/** The hawker-centre floor tiles. */
export const TILE = { base: P.tile, line: P.tileLine, shade: P.tileShade };
