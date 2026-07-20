/* Motion Magic — Template Definitions.
 *
 * Each template defines the baseline-video motion. The app reads these to
 * populate the Template dropdown in section 1c and builds the Seedance prompt
 * from the selected entry — the user never types a prompt.
 *
 * Fields:
 *   id     — stable unique key (used as the <option> value).
 *   label  — shown in the dropdown.
 *   prompt — the motion prompt. Refer to the actor as "Actor" and the scene as
 *            "Setting"; the app encodes those to Seedance's @Image1 / @Image2
 *            reference tokens (actor first, then setting) at submit time.
 *   sound  — description of the audio for this template. Used only when the
 *            "Include Sound" dropdown is set to Yes; appended to the prompt as
 *            an audio cue and turns on Seedance audio generation.
 *
 * To add or change templates, edit this file only — no app code changes needed.
 */
const VIDEO_TEMPLATES = [
  {
    id: "runway-walk",
    label: "Runway walk",
    prompt: "Actor walks confidently toward the camera like a runway model, full-body, crisp studio lighting.",
    sound: "upbeat fashion-runway music with a driving beat",
  },
  {
    id: "turn-and-smile",
    label: "Turn & smile",
    prompt: "Actor turns to face the camera and smiles warmly, subtle natural movement.",
    sound: "soft, cheerful background music",
  },
  {
    id: "360-showcase",
    label: "360° showcase",
    prompt: "Camera slowly orbits a full 360 degrees around Actor, showing the outfit from every angle.",
    sound: "smooth ambient electronic music",
  },
  {
    id: "street-stroll",
    label: "Street stroll",
    prompt: "Actor strolls through Setting at a relaxed pace while the camera tracks alongside.",
    sound: "gentle city ambience with light footsteps",
  },
  {
    id: "golden-hour",
    label: "Golden hour",
    prompt: "Actor walks past Setting at golden hour with warm backlight and soft lens flares.",
    sound: "warm acoustic-guitar melody",
  },
  {
    id: "spin-reveal",
    label: "Spin reveal",
    prompt: "Slow-motion as Actor spins to reveal the outfit, fabric flowing.",
    sound: "dreamy slow-motion whoosh with soft chimes",
  },
  {
    id: "confident-pose",
    label: "Confident pose",
    prompt: "Actor holds a confident pose with a subtle head tilt and gentle breathing motion.",
    sound: "minimal ambient pad",
  },
  {
    id: "push-in",
    label: "Cinematic push-in",
    prompt: "Camera pushes in from a wide shot to a medium close-up of Actor.",
    sound: "rising cinematic swell",
  },
  {
    id: "follow-shot",
    label: "Follow shot",
    prompt: "Handheld follow shot behind Actor as they move forward through Setting.",
    sound: "energetic footsteps and ambient movement",
  },
  {
    id: "breeze",
    label: "Gentle breeze",
    prompt: "A gentle breeze moves Actor's hair and clothing while they stand and look off-camera.",
    sound: "soft wind ambience",
  },
];

// Expose for the app (classic scripts share the global lexical scope, but be explicit).
window.VIDEO_TEMPLATES = VIDEO_TEMPLATES;
