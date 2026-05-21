import { NextResponse } from "next/server";
import { getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

type LimitBucket = {
  count: number;
  resetAt: number;
};

type ApiLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  requireUser?: boolean;
};

type GuardResult =
  | {
      ok: true;
      userId: string | null;
    }
  | {
      ok: false;
      response: NextResponse;
    };

const buckets = new Map<string, LimitBucket>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(identifier: string, options: ApiLimitOptions) {
  const now = Date.now();
  const bucketKey = `${options.key}:${identifier}`;
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs
    });
    return null;
  }

  if (current.count >= options.limit) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;
  buckets.set(bucketKey, current);

  return null;
}

export async function guardApiRequest(request: Request, options: ApiLimitOptions): Promise<GuardResult> {
  let userId: string | null = null;

  if (hasSupabaseServerEnv()) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    userId = user?.id || null;
  }

  if (options.requireUser && hasSupabaseServerEnv() && !userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请先登录后再使用这个功能。" }, { status: 401 })
    };
  }

  const identifier = userId || getClientIp(request);
  const retryAfter = checkRateLimit(identifier, options);

  if (retryAfter) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `请求太频繁了，请 ${retryAfter} 秒后再试。` },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter)
          }
        }
      )
    };
  }

  return {
    ok: true,
    userId
  };
}

export function trimText(value: string | undefined, maxLength: number) {
  return (value || "").trim().slice(0, maxLength);
}
