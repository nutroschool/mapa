import { supabase } from "@/lib/supabase";

export type InstagramConnectionState =
  | "checking"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type InstagramAccount = {
  username: string;
  account_type: string | null;
  profile_picture_url: string | null;
  followers?: number;
  media_count?: number;
};

export type InstagramMediaMetric = {
  id: string;
  caption: string;
  media_type: string;
  permalink: string;
  timestamp: string;
  thumbnail_url: string;
  likes: number;
  comments: number;
  views: number;
  reach: number;
  shares: number;
  saved: number;
  interactions: number;
};

export type InstagramMetrics = {
  connected: true;
  period_days: 30 | 90;
  synced_at: string;
  account: InstagramAccount & {
    followers: number;
    media_count: number;
  };
  summary: {
    views: number;
    reach: number;
    interactions: number;
    engagement: number;
  };
  media: InstagramMediaMetric[];
};

type InstagramFunctionPayload = {
  action: "start" | "status" | "metrics" | "disconnect";
  return_to?: string;
  period_days?: 30 | 90;
};

export async function invokeInstagram<T>(payload: InstagramFunctionPayload): Promise<T> {
  if (!supabase) throw new Error("O Supabase ainda não está configurado.");

  const { data, error } = await supabase.functions.invoke("instagram-integration", {
    body: payload,
  });

  if (error) {
    let message = "Não foi possível falar com a integração do Instagram.";
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null);
      if (payload && typeof payload.error === "string") message = payload.error;
    }
    throw new Error(message);
  }

  if (data && typeof data.error === "string") throw new Error(data.error);
  return data as T;
}
