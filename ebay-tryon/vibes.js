/* Motion Magic — Vibe Definitions.
 *
 * A Vibe is a one-sentence stylistic modifier layered on top of the selected
 * template, alongside the Director. The app appends the chosen vibe's `modifier`
 * to the template prompt (after the director's modifier, before the audio cue)
 * so it colors the overall mood without changing the template's motion.
 *
 * Fields:
 *   id       — stable unique key (used as the <option> value).
 *   label    — vibe name shown in the dropdown.
 *   modifier — ONE sentence describing the mood to apply. Written without the
 *              words "Actor"/"Setting" so the @Image1/@Image2 token-encoding pass
 *              leaves it untouched.
 *
 * To add or change them, edit this file only — no app code changes needed.
 */
const VIBE_DEFINITIONS = [
  {
    id: "playful",
    label: "Playful",
    modifier:
      "Give it a fun, playful energy with bright, upbeat spontaneity and a light, joyful charm.",
  },
  {
    id: "luxurious",
    label: "Luxurious",
    modifier:
      "Infuse an air of high-end luxury with opulent, polished elegance and a refined, premium finish.",
  },
  {
    id: "mysterious",
    label: "Mysterious",
    modifier:
      "Lend a moody, mysterious atmosphere with shadowy intrigue, subtle tension, and enigmatic cool.",
  },
  {
    id: "dreamy",
    label: "Dreamy",
    modifier:
      "Wrap it in a soft, dreamy haze with ethereal light, gentle grace, and a floating, otherworldly calm.",
  },
  {
    id: "bold-edgy",
    label: "Bold & Edgy",
    modifier:
      "Make it bold and edgy with daring attitude, striking contrast, and a confident, rebellious streak.",
  },
  {
    id: "serene",
    label: "Serene",
    modifier:
      "Keep a serene, tranquil mood with calm, unhurried movement and a peaceful, meditative stillness.",
  },
];

// Expose for the app (classic scripts share the global lexical scope, but be explicit).
window.VIBE_DEFINITIONS = VIBE_DEFINITIONS;
