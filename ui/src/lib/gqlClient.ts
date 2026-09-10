// Raw GraphQL client - zero dependencies.
// POST for query/mutation (session cookie rides along), a ~60-line
// graphql-transport-ws implementation for subscriptions.

export interface GqlClient {
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  subscribe<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    onNext: (data: T) => void,
    onError?: (err: unknown) => void,
  ): () => void;
}

export function createClient(baseURL = ""): GqlClient {
  const base = baseURL.replace(/\/$/, "");

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const r = await fetch(`${base}/api/graphql`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors?.length) throw new Error(j.errors[0].message);
    return j.data as T;
  }

  function wsURL(): string {
    if (base) {
      return base.replace(/^http/, "ws") + "/api/graphql";
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/api/graphql`;
  }

  function subscribe<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    onNext: (data: T) => void,
    onError?: (err: unknown) => void,
  ): () => void {
    const ws = new WebSocket(wsURL(), "graphql-transport-ws");
    const id = Math.random().toString(36).slice(2);
    let closedByUs = false;

    ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init", payload: {} }));
    ws.onerror = (e) => onError?.(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      switch (msg.type) {
        case "connection_ack":
          ws.send(JSON.stringify({ id, type: "subscribe", payload: { query, variables } }));
          break;
        case "next":
          onNext(msg.payload.data as T);
          break;
        case "error":
          onError?.(msg.payload);
          break;
        case "complete":
          if (!closedByUs) ws.close();
          break;
      }
    };
    return () => {
      closedByUs = true;
      try {
        ws.send(JSON.stringify({ id, type: "complete" }));
      } catch {
        /* socket may be gone */
      }
      ws.close();
    };
  }

  return { graphql, subscribe };
}

// ---- shared queries/mutations ----

export const ME = `{ me { id email } }`;
export const CHAT_SESSIONS = `{ chatSessions { id title pinned updatedAt } }`;

export interface User {
  id: string;
  email: string;
}

export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

// ---- PS162 FIRMS ----

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface FirmsPoint {
  id: string;
  latitude: number;
  longitude: number;
  acqDate: string;
  frp: number;
  confidence: string;
  satellite: string;
  distIndustrialM: number;
  insideIndustrial: boolean;
  persistenceScore: number;
  predictedClass: string;
  industrialProb: number;
  clusterId: string | null;
}

export interface ThermalCluster {
  id: string;
  centroidLat: number;
  centroidLon: number;
  count: number;
  avgFrp: number;
  maxFrp: number;
  persistence: number;
  firstSeen: string;
  lastSeen: string;
  predictedClass: string;
  osmId: string | null;
}

export interface Source {
  id: string;
  title: string | null;
  text: string;
  score: number;
}

export interface FirmsClassification {
  predictedClass: string;
  industrialProb: number;
  persistence: number;
  reasons: string[];
  landcover: number | null;
  similarCases: Source[];
}

export const FIRMS_POINTS_QUERY = `
  query FirmsPoints($bbox: BoundingBox!, $limit: Int, $dateFrom: String, $dateTo: String) {
    firmsPoints(bbox: $bbox, limit: $limit, dateFrom: $dateFrom, dateTo: $dateTo) {
      id latitude longitude acqDate frp confidence satellite
      distIndustrialM insideIndustrial persistenceScore predictedClass industrialProb clusterId
    }
  }
`;

export const THERMAL_CLUSTERS_QUERY = `
  query ThermalClusters($bbox: BoundingBox!) {
    thermalClusters(bbox: $bbox) {
      id centroidLat centroidLon count avgFrp maxFrp persistence firstSeen lastSeen predictedClass osmId
    }
  }
`;

export const CLASSIFY_FIRMS_POINT = `
  mutation ClassifyFirmsPoint($input: ClassifyFirmsPointInput!) {
    classifyFirmsPoint(input: $input) {
      predictedClass industrialProb persistence reasons landcover
      similarCases { id title text score }
    }
  }
`;
