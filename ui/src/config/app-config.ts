import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Orbis",
  version: packageJson.version,
  copyright: `© ${currentYear}, Orbis (Team Meridian, SIH26162).`,
  meta: {
    title: "Orbis — Industrial Fire Detection (PS162)",
    description:
      "Orbis classifies NASA FIRMS thermal detections as industrial fires vs. natural sources using OSM industrial-site enrichment, landcover, and a trained classifier with RAG-augmented AI arbitration for ambiguous cases.",
  },
};
