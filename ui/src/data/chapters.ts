export interface Chapter {
  index: number;
  kicker: string;
  title: string;
  subtitle: string;
  badges: { label: string; variant: "dark" | "light" }[];
  paragraphs: string[];
  mapImage: string;
  mapCoord: string;
  mapCoordSide?: "left";
  mapX: number;
  mapY: number;
  footerTitle?: string;
}

export const CHAPTERS: Chapter[] = [
  {
    index: 1,
    kicker: "Thermal Ingest, Worldwide",
    title: "Every Fire From Space",
    subtitle: "VIIRS + MODIS hotspots streaming in, deduplicated",
    badges: [
      { label: "NASA FIRMS Feed", variant: "dark" },
      { label: "SNPP / NOAA-20 / NOAA-21", variant: "light" },
    ],
    paragraphs: [
      "Satellites see heat. They can't tell a refinery flare from a forest fire. This system classifies NASA FIRMS thermal detections into industrial vs natural sources and puts them on a live GIS map.",
      "VIIRS (SNPP, NOAA-20, NOAA-21) plus MODIS hotspots stream in from NASA FIRMS — every 10-day window, every sensor, deduplicated.",
      "Each detection is timestamped, geolocated, and normalized against known sensor artifacts. The result is a clean, continuous stream of global thermal events ready for classification.",
    ],
    mapImage: "/static/images/map-00.png",
    mapCoord: "GLOBAL COVERAGE",
    mapX: 22.5,
    mapY: 33.5,
  },
  {
    index: 2,
    kicker: "Industrial Context",
    title: "Where the Heat Matters",
    subtitle: "OpenStreetMap industrial sites + ESA WorldCover join",
    badges: [
      { label: "OpenStreetMap", variant: "dark" },
      { label: "ESA WorldCover", variant: "light" },
    ],
    paragraphs: [
      "Each detection is joined against OpenStreetMap industrial sites (refineries, power plants, steel, mining, LNG) and ESA WorldCover land use.",
      "The system cross-references each thermal point with nearby infrastructure — power transmission lines, industrial corridors, mining concessions — to build contextual confidence for classification.",
      "Land cover data from ESA provides the final layer: a detection in a forested zone with no nearby industrial infrastructure is flagged differently from one at a known refinery complex.",
    ],
    mapImage: "/static/images/map-01.png",
    mapCoord: "0.3°N, 32.5°E",
    mapCoordSide: "left",
    mapX: 40,
    mapY: 65,
  },
  {
    index: 3,
    kicker: "AI Classification",
    title: "Separating Signal from Noise",
    subtitle: "Transformer trained on persistent thermal clusters",
    badges: [
      { label: "Deep Learning", variant: "dark" },
      { label: "Persistent Clusters", variant: "light" },
    ],
    paragraphs: [
      "A transformer trained on persistent thermal clusters separates industrial flares and thermal plants from forest fires, crop burning, and mining heat.",
      "The model learns spatial and temporal patterns: industrial sources tend to be persistent, geographically fixed, and correlated with known infrastructure. Wildfires show different signatures — they spread, fade, and shift with weather.",
      "Training data combines labeled satellite imagery, ground-truth industrial inventories, and historical fire records to build a robust classifier that works across geographies.",
    ],
    mapImage: "/static/images/map-02.png",
    mapCoord: "16.0°N, 22.9°W",
    mapX: 24.6,
    mapY: 41.2,
  },
  {
    index: 4,
    kicker: "GIS Overlay",
    title: "Live on the Map",
    subtitle: "Filter by class, date, and persistence",
    badges: [
      { label: "Real-Time Render", variant: "dark" },
      { label: "MapLibre GL", variant: "light" },
    ],
    paragraphs: [
      "Classified points and persistent clusters render as a live overlay on the map — filterable by class, date, and persistence.",
      "Each detection appears as a color-coded point: red for industrial flares, orange for thermal power, purple for mining, green for forest, yellow for agriculture. Cluster intensity indicates persistence over time.",
      "Users can zoom, pan, and filter by time window to see exactly what thermal activity looks like across any region of interest. The map updates as new data streams in.",
    ],
    mapImage: "/static/images/map-03.png",
    mapCoord: "3.1°S, 60.0°W",
    mapX: 18.5,
    mapY: 43.5,
  },
  {
    index: 5,
    kicker: "Per-Point Explainability",
    title: "Why Was This Flagged",
    subtitle: "Confidence, history, and source attribution",
    badges: [
      { label: "Explainability", variant: "dark" },
      { label: "Audit Trail", variant: "light" },
    ],
    paragraphs: [
      "Every classification comes with a confidence score, a history of prior detections at the same location, and the specific infrastructure data that informed the decision.",
      "Click any point on the map and you see: the predicted class, confidence percentage, how many times this location has been detected before, nearby industrial sites within 5km, and land cover classification.",
      "This transparency means analysts can verify, override, or investigate any classification. The system learns from corrections, continuously improving its accuracy.",
    ],
    mapImage: "/static/images/map-04.png",
    mapCoord: "15.2°S, 122.8°W",
    mapX: 35,
    mapY: 55,
  },
  {
    index: 6,
    kicker: "Dashboard Integration",
    title: "One Click to Monitor",
    subtitle: "Full FIRMS-style world map with class filters",
    badges: [
      { label: "Dashboard", variant: "dark" },
      { label: "Live Filters", variant: "light" },
    ],
    paragraphs: [
      "Sign in to open the dashboard: the same detections as this globe, on a full FIRMS-style world map with class filters and per-point explanations.",
      "The dashboard provides temporal analysis — view detection trends over weeks, months, or years. Compare regions. Export filtered datasets for further analysis in your own GIS tools.",
      "Built for decision-makers: whether you're tracking industrial emissions, monitoring deforestation-linked fires, or auditing compliance, the dashboard turns raw thermal data into actionable insight.",
    ],
    mapImage: "/static/images/map-05.png",
    mapCoord: "GLOBAL DASHBOARD",
    mapX: 50,
    mapY: 45,
  },
  {
    index: 7,
    kicker: "See It Live",
    title: "Every Heat, Explained",
    subtitle: "From satellites to decisions — thermal intelligence in real time",
    badges: [
      { label: "Open Access", variant: "dark" },
      { label: "Try It Now", variant: "light" },
    ],
    paragraphs: [
      "The system is live. Every thermal detection from NASA's satellites, classified by AI, enriched with industrial context, and rendered on an interactive map — available to anyone.",
      "Whether you're a researcher, policymaker, or journalist, this tool gives you the same classified thermal intelligence that was previously locked in raw satellite feeds.",
      "Every fire from space. Only the industrial ones, flagged. That's the promise — and it's running now.",
    ],
    mapImage: "/static/images/map-06.png",
    mapCoord: "YOUR LOCATION",
    mapX: 45,
    mapY: 40,
  },
];
