/* Motion Magic — Template Definitions.
 *
 * Each template defines the baseline-video motion. The app reads these to
 * populate the Template dropdown in section 1c and builds the Seedance prompt
 * from the selected entry — the user never types a prompt.
 *
 * Fields (public shape consumed by app.js):
 *   id     — stable unique key (used as the <option> value).
 *   label  — shown in the dropdown.
 *   prompt — the full motion description (a detailed paragraph). Refer to the
 *            actor as "Actor" and the scene as "Setting"; the app encodes those
 *            to Seedance's @Image1 / @Image2 reference tokens (actor first, then
 *            setting) at submit time. This paragraph is also shown to the user as
 *            the auto-generated description beneath the dropdown.
 *   sound  — description of the audio for this template. Used only when the
 *            "Include Sound" dropdown is set to Yes; appended to the prompt as
 *            an audio cue and turns on Seedance audio generation.
 *
 * Consistency model:
 *   Each template pins a per-template technical camera anchor (a locked lens,
 *   move, and framing) inside its `motion`, and every template shares a single
 *   CONSISTENCY_PROFILE clause. Together these constrain camera path, framing,
 *   pacing, and grade to fixed tolerances so repeated generations from the same
 *   template stay visually predictable — the same composition, rhythm, and look
 *   every run, while only the subject and wardrobe change. Deliberately avoids
 *   the words "Actor"/"Setting" so the token-encoding pass never rewrites it.
 *
 * To add or change templates, edit this file only — no app code changes needed.
 */

// Shared, locked profile appended to every template. Written without the words
// "Actor"/"Setting" so it survives the @Image1/@Image2 encoding untouched.
const CONSISTENCY_PROFILE =
  "Consistency profile — this template is locked to a fixed cinematographic recipe so results stay " +
  "repeatable and predictable across runs: the camera path, framing, focal length, pacing, and " +
  "lighting are held to tight tolerances, driven through 24 fps motion at a 180-degree shutter with " +
  "temporal-coherence stabilization and deterministic keyframing to minimize run-to-run drift. A " +
  "calibrated three-point lighting rig and a color-managed neutral grade fix the exposure and tone, " +
  "so the composition, rhythm, and overall look are reproduced identically every time and only the " +
  "subject and their wardrobe vary.";

// Per-template creative motion + a locked technical anchor. `prompt` below is
// assembled as `${motion} ${CONSISTENCY_PROFILE}`.
const TEMPLATE_SOURCE = [
  {
    id: "runway-walk",
    label: "Runway walk",
    motion:
      "Actor strides confidently toward the camera with the poise of a runway model, framed full-body " +
      "from head to toe. The walk is smooth and deliberate — shoulders back, chin level, each step " +
      "landing with purpose while the outfit moves and sways naturally with the body. The shot is locked " +
      "to a static, slightly low camera angle on a 35mm-equivalent lens to keep a consistent full-length " +
      "silhouette, lit with crisp, even studio light against a clean seamless backdrop. As Actor nears the " +
      "lens they slow and settle into a final confident pose, held for the camera.",
    sound:
      "an upbeat fashion-runway track with a punchy, driving beat and bright synth stabs, evoking the energy of a live catwalk show.",
  },
  {
    id: "turn-and-smile",
    label: "Turn & smile",
    motion:
      "Actor begins with their side or back to the camera and turns gracefully to face the lens, breaking " +
      "into a warm, genuine smile as their eyes meet the camera. The movement is relaxed and unhurried, " +
      "with a subtle shift of weight, a small toss of the hair, and the outfit settling naturally as they " +
      "come around. Framing holds a fixed, tripod-steady medium shot on a 50mm-equivalent lens with a " +
      "soft, repeatable key-to-fill ratio that flatters the face and keeps every detail of the clothing " +
      "clearly visible.",
    sound:
      "soft, cheerful acoustic background music with light percussion and a friendly, welcoming mood.",
  },
  {
    id: "360-showcase",
    label: "360° showcase",
    motion:
      "The camera performs a slow, smooth 360-degree orbit around Actor, who stands tall and turns their " +
      "head slightly to follow the lens, presenting the outfit from every angle. The orbit follows a " +
      "fixed-radius circular track at a constant angular speed for an even, repeatable rotation that " +
      "reveals the front, profile, and back of the garment in one continuous, unbroken move. Even, " +
      "wraparound lighting eliminates harsh shadows so fabric texture, seams, and fit read clearly, all " +
      "against a minimal Setting that stays quietly out of the way.",
    sound:
      "smooth ambient electronic music with a steady pulse and airy pads that build gently through the rotation.",
  },
  {
    id: "street-stroll",
    label: "Street stroll",
    motion:
      "Actor strolls at an easy, relaxed pace through Setting while the camera tracks alongside on a " +
      "constant-speed lateral dolly, holding a fixed subject-to-camera distance on a 35mm-equivalent lens " +
      "so Actor stays centered and the same size in frame throughout. Their gait is casual and self-assured, " +
      "arms swinging naturally and the outfit moving with each stride. Natural daylight and a shallow depth " +
      "of field keep Actor crisp while Setting blurs softly behind them, and occasionally Actor glances " +
      "toward the lens with an easy confidence.",
    sound:
      "gentle city ambience — distant traffic, a soft breeze, and footsteps — layered under a laid-back lo-fi groove.",
  },
  {
    id: "golden-hour",
    label: "Golden hour",
    motion:
      "Actor walks slowly through Setting during golden hour, backlit by a low, warm sun that rims their " +
      "hair and shoulders with a glowing halo and casts long, soft shadows. Subtle lens flares drift across " +
      "the frame as they move, and a faint haze catches the light for a dreamy, luminous atmosphere. The " +
      "camera floats with Actor on a slow, fixed-rate drift, and the white balance is pinned to a warm " +
      "~3200K key so the golden-hour palette — rich amber and honeyed tones — reproduces consistently from " +
      "run to run.",
    sound:
      "a warm, intimate acoustic-guitar melody with soft strings and a nostalgic, sunset mood.",
  },
  {
    id: "spin-reveal",
    label: "Spin reveal",
    motion:
      "Actor spins on the spot in graceful slow motion, arms slightly extended, so the outfit flares " +
      "outward and the fabric flows and ripples with the momentum. Every fold, pleat, and movement of the " +
      "garment becomes exaggerated and beautiful at reduced speed, hair fanning out and catching the light " +
      "at the peak of the turn. The camera holds a locked medium-wide frame with a fixed slow-motion time " +
      "ramp so the reveal timing stays repeatable, lit with dramatic, directional light that sculpts the " +
      "form against a clean, uncluttered Setting.",
    sound:
      "a dreamy slow-motion whoosh with shimmering chimes and a swelling, ethereal pad.",
  },
  {
    id: "confident-pose",
    label: "Confident pose",
    motion:
      "Actor holds a strong, confident fashion pose with a subtle head tilt and a steady gaze into the " +
      "lens, weight shifted onto one hip. The motion is minimal but alive — gentle breathing, a slow blink, " +
      "a small adjustment of the stance — giving the shot the polished quality of a moving editorial " +
      "portrait. The frame is a static, tripod-locked medium shot on an 85mm-equivalent lens with a " +
      "calibrated soft key and defined, shaping shadows, set against a simple Setting that keeps the styling " +
      "front and center.",
    sound:
      "a minimal ambient pad with a slow, understated beat and a cool, high-fashion mood.",
  },
  {
    id: "push-in",
    label: "Cinematic push-in",
    motion:
      "The camera opens on a wide establishing shot of Actor within Setting and pushes in on a fixed axis " +
      "at a constant rate to a flattering medium close-up, building intimacy and drawing focus to Actor's " +
      "expression and the fine details of the outfit. Actor stays mostly still, offering only subtle " +
      "movement — a slow turn of the head, a soft smile, a calm blink — as the frame tightens. The dolly-in " +
      "distance and speed are fixed so the move lands identically every run, with cinematic gentle contrast " +
      "and a shallow depth of field.",
    sound:
      "a rising cinematic swell of strings and low brass that crescendos as the camera pushes in.",
  },
  {
    id: "follow-shot",
    label: "Follow shot",
    motion:
      "The camera follows just behind and slightly to the side of Actor in a stabilized behind-the-shoulder " +
      "move as they walk forward through Setting, holding a fixed trailing distance on a 35mm-equivalent " +
      "lens for a consistent, immersive sense of momentum. Actor's stride is purposeful and steady, and now " +
      "and then they glance back toward the lens. The environment streams past on either side with a " +
      "controlled, gentle motion, and daylight shifts across Actor and the outfit as they advance deeper " +
      "into Setting.",
    sound:
      "energetic, rhythmic footsteps and lively ambient movement under an upbeat, driving instrumental.",
  },
  {
    id: "breeze",
    label: "Gentle breeze",
    motion:
      "Actor stands mostly still and gazes off-camera with a calm, contemplative expression while a gentle " +
      "breeze moves through the scene, lifting their hair and rippling the fabric of the outfit. The motion " +
      "is soft and continuous, giving the shot a serene, editorial stillness with just enough movement to " +
      "feel alive. The frame is near-static with a barely-perceptible fixed-rate drift and a constant, " +
      "gentle wind simulation, lit with soft natural light against a quiet Setting for a tranquil, " +
      "wind-kissed mood that stays consistent across takes.",
    sound:
      "soft wind ambience with distant, airy tones and a calm, meditative undercurrent.",
  },
];

// Compose the public templates: creative motion + shared consistency profile.
const VIDEO_TEMPLATES = TEMPLATE_SOURCE.map((t) => ({
  id: t.id,
  label: t.label,
  prompt: `${t.motion} ${CONSISTENCY_PROFILE}`,
  sound: t.sound,
}));

// Expose for the app (classic scripts share the global lexical scope, but be explicit).
window.VIDEO_TEMPLATES = VIDEO_TEMPLATES;
