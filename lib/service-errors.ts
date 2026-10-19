import { NextResponse } from "next/server";

export class ServiceError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "ServiceError";
  }
}

export function hasServiceKey(value?: string) {
  return Boolean(value?.trim() && !/your[-_]|placeholder/i.test(value));
}

export function serviceErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "请求格式不正确，请重新提交。" }, { status: 400 });
  const message = error instanceof Error ? error.message : "";
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
  console.error("[service] request failed", { name: error instanceof Error ? error.name : "unknown", status });
  if (/timeout|timed out|abort|deadline/i.test(message)) return NextResponse.json({ error: "这次回应等得有点久，请稍后重试。已填写的内容会保留。" }, { status: 504 });
  if (status === 401 || status === 403) return NextResponse.json({ error: "服务暂时无法连接，请稍后再试。" }, { status: 503 });
  if (status === 429) return NextResponse.json({ error: "服务当前繁忙，请稍后重试。" }, { status: 503 });
  return NextResponse.json({ error: fallback }, { status: 502 });
}
