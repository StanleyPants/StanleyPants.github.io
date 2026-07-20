/* Motion Magic — Template Definitions.
 *
 * Each template defines the baseline-video motion. The app reads these to
 * populate the Template dropdown in section 1c and builds the video prompt from
 * the selected entry — the user never types a prompt.
 *
 * Fields (public shape consumed by app.js):
 *   id     — stable unique key (used as the <option> value).
 *   label  — shown in the dropdown.
 *   prompt — the full motion description (a detailed paragraph). Refer to the
 *            actor as "Actor" and the scene as "Setting"; the app rewrites those
 *            to natural terms ("the subject" / "the scene") before submitting.
 *            This paragraph is also shown to the user as the auto-generated
 *            description beneath the dropdown.
 *   sound  — description of the audio for this template. Used only when the
 *            "Include Sound" dropdown is set to Yes; appended to the prompt as
 *            an audio cue and turns on audio generation.
 *
 * Motion model:
 *   The video is a single-image animation (Kling). To keep results feeling
 *   organic and cinematic — not stiff — each template drives deliberate,
 *   continuous camera movement (dolly, push-in, orbit, crane, handheld) plus a
 *   gentle zoom and natural parallax, alongside lifelike subject motion. A
 *   shared MOTION_PROFILE reinforces that look across every template.
 *
 * To add or change templates, edit this file only — no app code changes needed.
 */

// Shared clause appended to every template. Keeps the consistent, tuned look
// while explicitly pushing continuous, motivated camera movement so the videos
// feel organic rather than static. Avoids the words "Actor"/"Setting".
const MOTION_PROFILE =
  "Optimized for a consistent, cinematic look: the framing, focal length, pacing, color grade, and " +
  "lighting recipe are tuned to fixed tolerances so results stay predictable across runs, while only " +
  "the subject and wardrobe vary. Throughout the shot the camera stays in smooth, continuous, motivated " +
  "motion with a gentle zoom, natural parallax between foreground and background, and subtle handheld " +
  "life, and the subject moves with natural, lifelike physics — rendered at 24 fps with " +
  "temporal-coherence stabilization for organic, filmic movement rather than a frozen, static frame.";

// Per-template creative motion. `prompt` below is `${motion} ${MOTION_PROFILE}`.
const TEMPLATE_SOURCE = [
  {
    id: "runway-walk",
    label: "Runway walk",
    motion:
      "Actor walks confidently straight toward the camera with the poise of a runway model, full body in " +
      "frame, while the camera glides backward on a smooth dolly and eases into a slow zoom to hold them " +
      "as they approach. The walk is alive — shoulders swaying, hips moving, the outfit rippling with each " +
      "step — and a subtle handheld drift lets the shot breathe. As Actor nears the lens, the camera " +
      "settles and pushes in for a final confident beat.",
    sound:
      "an upbeat fashion-runway track with a punchy, driving beat and bright synth stabs, evoking the energy of a live catwalk show.",
  },
  {
    id: "turn-and-smile",
    label: "Turn & smile",
    motion:
      "Actor starts with their side or back to the camera and turns gracefully to face the lens, breaking " +
      "into a warm, natural smile, while the camera glides in on a slow dolly and gentle zoom to close the " +
      "distance as they come around. Hair sways, weight shifts, and the outfit settles in motion. A soft " +
      "handheld float keeps the frame feeling live and organic rather than static.",
    sound:
      "soft, cheerful acoustic background music with light percussion and a friendly, welcoming mood.",
  },
  {
    id: "360-showcase",
    label: "360° showcase",
    motion:
      "The camera sweeps in a smooth, continuous orbit around Actor while easing in with a slow zoom, " +
      "revealing the outfit from every angle with momentum and depth as the background slides past in " +
      "parallax. Actor turns their head and shifts their weight to stay engaged with the lens. The move " +
      "never stops, giving an energetic, three-dimensional showcase of the whole look.",
    sound:
      "smooth ambient electronic music with a steady pulse and airy pads that build gently through the rotation.",
  },
  {
    id: "street-stroll",
    label: "Street stroll",
    motion:
      "Actor strolls at an easy pace through Setting while the camera tracks alongside and slightly ahead " +
      "on a smooth dolly, with strong parallax as foreground and background elements slide past at " +
      "different speeds. The camera drifts with subtle handheld life and eases into an occasional gentle " +
      "push-in. Actor's stride is loose and natural, arms swinging, the outfit moving, and they glance " +
      "toward the lens with easy confidence.",
    sound:
      "gentle city ambience — distant traffic, a soft breeze, and footsteps — layered under a laid-back lo-fi groove.",
  },
  {
    id: "golden-hour",
    label: "Golden hour",
    motion:
      "Actor walks slowly through Setting during golden hour while the camera cranes and drifts with them " +
      "and eases into a soft zoom, warm backlight rimming their hair and shoulders as lens flares drift " +
      "across the frame. Long shadows stretch and shift with the movement, haze catches the light, and " +
      "gentle parallax adds depth as the environment glides past, all in rich amber tones.",
    sound:
      "a warm, intimate acoustic-guitar melody with soft strings and a nostalgic, sunset mood.",
  },
  {
    id: "spin-reveal",
    label: "Spin reveal",
    motion:
      "Actor spins in graceful slow motion so the outfit flares and the fabric flows, while the camera " +
      "arcs around them and pushes in on the reveal, catching the movement from a dynamic angle. Hair " +
      "fans out, the garment ripples, and the combined subject spin and camera arc create swirling, " +
      "organic motion with real depth rather than a flat turn.",
    sound:
      "a dreamy slow-motion whoosh with shimmering chimes and a swelling, ethereal pad.",
  },
  {
    id: "confident-pose",
    label: "Confident pose",
    motion:
      "Actor holds a confident pose with subtle, lifelike movement — gentle breathing, a slow blink, a " +
      "small shift of weight and head — while the camera creeps in on a slow, continuous push and eases " +
      "into a soft zoom, gradually tightening from a medium shot toward the face and outfit. A faint " +
      "handheld drift and slight parallax keep the shot alive and cinematic rather than frozen.",
    sound:
      "a minimal ambient pad with a slow, understated beat and a cool, high-fashion mood.",
  },
  {
    id: "push-in",
    label: "Cinematic push-in",
    motion:
      "Starting wide on Actor within Setting, the camera performs a smooth, continuous push-in with an " +
      "accompanying zoom, traveling from a full wide shot to a flattering medium close-up while building " +
      "intimacy. Actor offers subtle, natural movement — a slow head turn, a soft smile — and gentle " +
      "parallax between them and the background adds depth and life to the move.",
    sound:
      "a rising cinematic swell of strings and low brass that crescendos as the camera pushes in.",
  },
  {
    id: "follow-shot",
    label: "Follow shot",
    motion:
      "The camera follows just behind and beside Actor in a dynamic, stabilized handheld move as they walk " +
      "forward through Setting, with a natural bob, shifting parallax, and occasional changes of pace that " +
      "make it feel live and organic. Actor's stride is purposeful, they glance back toward the lens, and " +
      "the camera eases into a gentle push-in as they move deeper into the environment.",
    sound:
      "energetic, rhythmic footsteps and lively ambient movement under an upbeat, driving instrumental.",
  },
  {
    id: "breeze",
    label: "Gentle breeze",
    motion:
      "Actor stands mostly still with a calm expression while a gentle breeze lifts their hair and ripples " +
      "the outfit, and the camera slowly drifts and eases into a soft, continuous zoom, gradually revealing " +
      "more of Setting with gentle parallax. The subtle wind, the drifting camera, and the slow zoom " +
      "combine into a serene but living shot that never feels frozen.",
    sound:
      "soft wind ambience with distant, airy tones and a calm, meditative undercurrent.",
  },
];

// Compose the public templates: creative motion + shared motion profile.
const VIDEO_TEMPLATES = TEMPLATE_SOURCE.map((t) => ({
  id: t.id,
  label: t.label,
  prompt: `${t.motion} ${MOTION_PROFILE}`,
  sound: t.sound,
}));

// Expose for the app (classic scripts share the global lexical scope, but be explicit).
window.VIDEO_TEMPLATES = VIDEO_TEMPLATES;
