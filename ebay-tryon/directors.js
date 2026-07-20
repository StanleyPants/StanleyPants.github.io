/* Motion Magic — Director Definitions.
 *
 * A Director is a one-sentence stylistic modifier layered on top of the selected
 * template. The app appends the chosen director's `modifier` to the template
 * prompt (after the template's own text, before the audio cue) so it shapes the
 * overall look without changing the template's motion.
 *
 * Fields:
 *   id       — stable unique key (used as the <option> value).
 *   label    — director name shown in the dropdown.
 *   modifier — ONE sentence describing the visual style to apply. Written
 *              without the words "Actor"/"Setting" so the @Image1/@Image2
 *              token-encoding pass leaves it untouched.
 *
 * These are archetypal director personas (not real people). To add or change
 * them, edit this file only — no app code changes needed.
 */
const DIRECTOR_DEFINITIONS = [
  {
    id: "epic-visionary",
    label: "The Epic Visionary",
    modifier:
      "Frame everything with sweeping, larger-than-life grandeur — bold wide compositions, dramatic depth, and a majestic, cinematic scale.",
  },
  {
    id: "intimate-realist",
    label: "The Intimate Realist",
    modifier:
      "Keep it grounded and naturalistic — subtle handheld intimacy, honest available-light tones, and quiet human authenticity.",
  },
  {
    id: "neon-stylist",
    label: "The Neon Stylist",
    modifier:
      "Push a bold, high-contrast neon aesthetic — saturated colored gels, glossy reflections, and sleek, hyper-stylized cool.",
  },
  {
    id: "vintage-romantic",
    label: "The Vintage Romantic",
    modifier:
      "Wrap the scene in warm, nostalgic film-grain romance — soft halation, gentle pastel tones, and a dreamy analog mood.",
  },
  {
    id: "kinetic-energizer",
    label: "The Kinetic Energizer",
    modifier:
      "Charge the shot with punchy, high-energy dynamism — snappy timing, bold movement, and vibrant, commercial-grade pop.",
  },
];

// Expose for the app (classic scripts share the global lexical scope, but be explicit).
window.DIRECTOR_DEFINITIONS = DIRECTOR_DEFINITIONS;
