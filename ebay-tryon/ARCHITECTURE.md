# eBay Motion Studio — Architecture

A static browser app (GitHub Pages) that talks to three external services **only through a thin
Deno Deploy proxy**, which holds every secret and adds the CORS headers the browser can't get directly.

## System / components

```mermaid
flowchart LR
  subgraph BROWSER["🖥️ Browser — GitHub Pages (stanleypants.github.io/ebay-tryon)"]
    APP["eBay Motion Studio<br/>index.html · app.js · styles.css"]
    DEFS["Backend definition files<br/>templates.js · directors.js · vibes.js"]
    LS[("localStorage<br/>Decart API key · cast · set locations")]
    DEFS --> APP
    APP <--> LS
  end

  subgraph PROXY["☁️ Deno Deploy proxy — holds secrets: FAL_KEY, EBAY_CLIENT_ID/SECRET"]
    R1["/fal/*  → queue.fal.run"]
    R2["/ebay   → eBay Browse API"]
    R3["/img    → image/video bytes"]
    R4["/v1/*   → api.decart.ai"]
  end

  subgraph FAL["🎨 fal.ai"]
    NB["Nano Banana<br/>actor & set candidates"]
    NBE["Nano Banana edit<br/>composite / reframe → 16:9"]
    KL["Kling 2.6 Pro<br/>image→video (+native audio)"]
  end

  EBAY["🛒 eBay Browse API<br/>listing images (OAuth)"]
  DECART["🎬 Decart · lucy-latest<br/>try-on video jobs"]

  APP -->|"create & stage images"| R1
  APP -->|"generate video"| R1
  R1 --> NB
  R1 --> NBE
  R1 --> KL

  APP -->|"search listings"| R2 --> EBAY
  APP -->|"fetch bytes to upload"| R3
  APP -->|"try-on per listing"| R4 --> DECART
```

- **Browser** — vanilla HTML/CSS/JS, no build step. The Decart key and the user's saved **cast** /
  **set locations** live only in `localStorage`. Motion presets are edited in the standalone
  `templates.js` / `directors.js` / `vibes.js` definition files.
- **Deno proxy** — the only place secrets live (`FAL_KEY`, eBay client id/secret). It injects those
  keys server-side, strips browser headers the upstreams reject, buffers request bodies so uploads
  carry a real `Content-Length`, and adds CORS. `GET /__whoami` returns the version marker.
- **External services** — fal.ai (image + video models), eBay Browse API (listings), Decart (try-on).

## Data pipeline

```mermaid
flowchart TD
  A["1a · Cast the Actor<br/>describe person & wardrobe"] -->|"4 candidates · 9:16"| NB1["fal · Nano Banana<br/>(fixed audition style)"]
  NB1 --> AP["Chosen actor → Cast library"]

  B["1b · Choose the Set<br/>describe the scene"] -->|"4 candidates · 16:9"| NB2["fal · Nano Banana"]
  NB2 --> BP["Chosen set → Locations library"]

  AP --> STG["1d · Stage the shot<br/>fal · Nano Banana edit<br/>composite actor into set (or reframe) → 16:9"]
  BP --> STG
  STG --> COMP["16:9 composite image<br/>(shown on the stage)"]

  MM["1c · Motion Magic<br/>Template + Director + Vibe<br/>+ Sound + Duration"] --> GEN
  COMP --> GEN["Generate baseline video<br/>fal · Kling 2.6 Pro image→video"]
  GEN --> VID["Baseline video · 16:9 (+ambient audio)"]

  E["2 · eBay listings<br/>keywords / seller URL"] --> EB["proxy /ebay → eBay Browse API"]
  EB --> PICK["First 10 images → pick up to 5"]

  VID --> TRY["3 · Try-on — one Decart job per listing<br/>data = baseline video, reference_image = listing"]
  PICK --> TRY
  TRY --> OUT["Up to 5 output try-on videos"]
```

Every model/API call above is routed through the Deno proxy; the browser never contacts fal.ai, eBay,
or Decart directly.

## Prompt composition (Motion Magic)

The Kling video prompt is assembled from the definition files plus the user's choices:

```
template.motion  +  MOTION_PROFILE  +  director.modifier  +  vibe.modifier  +  ["Audio: " + template.sound]
```

Then `Actor` / `Setting` are rewritten to natural terms (`the subject` / `the scene`) before submission.

## Rendered images (PNG)

Static exports of the diagrams above, for slides/docs (the Mermaid blocks render inline on GitHub):

**System & components**

![System and components diagram](docs/architecture-components.png)

**Data pipeline**

![Data pipeline diagram](docs/architecture-pipeline.png)
