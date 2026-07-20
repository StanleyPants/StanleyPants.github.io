/* Motion Magic — Template Definitions.
 *
 * Each template defines the baseline-video motion. The app reads these to
 * populate the Template dropdown in section 1c and builds the Seedance prompt
 * from the selected entry — the user never types a prompt.
 *
 * Fields:
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
 * To add or change templates, edit this file only — no app code changes needed.
 */
const VIDEO_TEMPLATES = [
  {
    id: "runway-walk",
    label: "Runway walk",
    prompt:
      "Actor strides confidently toward the camera with the poise of a runway model, framed full-body from head to toe. The walk is smooth and deliberate — shoulders back, chin level, each step landing with purpose while the outfit moves and sways naturally with the body. The camera holds steady at a slight low angle to lengthen the silhouette, lit with crisp, even studio light against a clean seamless backdrop that keeps all attention on Actor and the garment. As Actor nears the lens, they slow and settle into a final confident pose, holding the look for the camera.",
    sound:
      "an upbeat fashion-runway track with a punchy, driving beat and bright synth stabs, evoking the energy of a live catwalk show.",
  },
  {
    id: "turn-and-smile",
    label: "Turn & smile",
    prompt:
      "Actor begins with their side or back to the camera and turns gracefully to face the lens, breaking into a warm, genuine smile as their eyes meet the camera. The movement is relaxed and unhurried, with a subtle shift of weight, a small toss of the hair, and the outfit settling naturally as they come around. Soft, flattering key light wraps around the face while a gentle fill keeps every detail of the clothing clearly visible. The framing is a comfortable medium shot that captures both the expression and the full look.",
    sound:
      "soft, cheerful acoustic background music with light percussion and a friendly, welcoming mood.",
  },
  {
    id: "360-showcase",
    label: "360° showcase",
    prompt:
      "The camera performs a slow, smooth 360-degree orbit around Actor, who stands tall and turns their head slightly to follow the lens, presenting the outfit from every angle. The rotation is steady and cinematic, revealing the front, profile, and back of the garment in one continuous, unbroken move. Even, wraparound lighting eliminates harsh shadows so fabric texture, seams, and fit read clearly throughout the spin, all set against a minimal Setting that stays quietly out of the way and lets the look take center stage.",
    sound:
      "smooth ambient electronic music with a steady pulse and airy pads that build gently through the rotation.",
  },
  {
    id: "street-stroll",
    label: "Street stroll",
    prompt:
      "Actor strolls at an easy, relaxed pace through Setting while the camera tracks alongside in a smooth lateral dolly, keeping Actor centered in the frame. Their gait is casual and self-assured, arms swinging naturally and the outfit moving with each stride. Natural daylight and the passing environment give the shot an effortless, editorial street-style feel, while a shallow depth of field keeps Actor crisp and lets Setting blur softly behind them. Occasionally Actor glances toward the lens with an easy confidence.",
    sound:
      "gentle city ambience — distant traffic, a soft breeze, and footsteps — layered under a laid-back lo-fi groove.",
  },
  {
    id: "golden-hour",
    label: "Golden hour",
    prompt:
      "Actor walks slowly through Setting during golden hour, backlit by a low, warm sun that rims their hair and shoulders with a glowing halo and casts long, soft shadows across the ground. Subtle lens flares drift across the frame as they move, and a faint haze in the air catches the light for a dreamy, luminous atmosphere. The camera floats gently with Actor in a slow, drifting movement, and the entire scene is bathed in rich amber and honeyed tones that flatter both skin and fabric.",
    sound:
      "a warm, intimate acoustic-guitar melody with soft strings and a nostalgic, sunset mood.",
  },
  {
    id: "spin-reveal",
    label: "Spin reveal",
    prompt:
      "Actor spins on the spot in graceful slow motion, arms slightly extended, so the outfit flares outward and the fabric flows and ripples with the momentum. Every fold, pleat, and movement of the garment becomes exaggerated and beautiful at reduced speed, hair fanning out and catching the light at the peak of the turn. The camera holds a steady medium-wide shot with dramatic, directional lighting that sculpts the form and emphasizes texture, all against a clean, uncluttered Setting that keeps the focus on the reveal.",
    sound:
      "a dreamy slow-motion whoosh with shimmering chimes and a swelling, ethereal pad.",
  },
  {
    id: "confident-pose",
    label: "Confident pose",
    prompt:
      "Actor holds a strong, confident fashion pose with a subtle head tilt and a steady gaze into the lens, weight shifted onto one hip. The motion is minimal but alive — gentle breathing, a slow blink, a small adjustment of the stance — giving the shot the polished quality of a moving editorial portrait. Controlled studio lighting with a soft key and defined, shaping shadows sculpts the face and outfit, and the framing is a clean medium shot against a simple Setting that keeps the styling front and center.",
    sound:
      "a minimal ambient pad with a slow, understated beat and a cool, high-fashion mood.",
  },
  {
    id: "push-in",
    label: "Cinematic push-in",
    prompt:
      "The camera opens on a wide establishing shot of Actor within Setting and pushes in slowly and smoothly to a flattering medium close-up, building intimacy and drawing focus to Actor's expression and the fine details of the outfit. Actor stays mostly still, offering only subtle movement — a slow turn of the head, a soft smile, a calm blink — as the frame gradually tightens around them. Cinematic lighting with gentle contrast and a shallow depth of field lends the move a filmic, high-production feel.",
    sound:
      "a rising cinematic swell of strings and low brass that crescendos as the camera pushes in.",
  },
  {
    id: "follow-shot",
    label: "Follow shot",
    prompt:
      "The camera follows just behind and slightly to the side of Actor in a dynamic handheld move as they walk forward through Setting, creating an immersive, in-the-moment sense of momentum. Actor's stride is purposeful and steady, and now and then they glance back toward the lens. The environment streams past on either side with a natural, energetic bounce to the camera, and daylight shifts across Actor and the outfit as they advance deeper into Setting.",
    sound:
      "energetic, rhythmic footsteps and lively ambient movement under an upbeat, driving instrumental.",
  },
  {
    id: "breeze",
    label: "Gentle breeze",
    prompt:
      "Actor stands mostly still and gazes off-camera with a calm, contemplative expression while a gentle breeze moves through the scene, lifting their hair and rippling the fabric of the outfit. The motion is soft and continuous, giving the shot a serene, editorial stillness with just enough movement to feel alive and breathing. Soft natural light and a quiet Setting complete the tranquil, wind-kissed mood, while the camera drifts almost imperceptibly to add a subtle sense of depth.",
    sound:
      "soft wind ambience with distant, airy tones and a calm, meditative undercurrent.",
  },
];

// Expose for the app (classic scripts share the global lexical scope, but be explicit).
window.VIDEO_TEMPLATES = VIDEO_TEMPLATES;
