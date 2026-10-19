import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolveImageConfig } from "../lib/image-config";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=";
let provider: Server;
let assetServer: Server;
let origin: string;
let assetOrigin: string;
let chatContent: unknown;
let chatStatus = 200;
let chatRequests = 0;
let imageResponse: unknown;
let lastBody: Record<string, unknown>;
let assetAuth: string | undefined;
let followup: (request: Request) => Promise<Response>;
let analyze: typeof followup;
let ask: typeof followup;
let image: typeof followup;
let requestId = 0;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "test-chat";
  process.env.GEMINI_IMAGE_API_KEY = "test-image-key";
  provider = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    lastBody = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    response.setHeader("Content-Type", "application/json");
    if (request.url?.includes("chat/completions")) {
      chatRequests++;
      response.statusCode = chatStatus;
      response.end(JSON.stringify(chatStatus === 200 ? { choices: [{ message: { content: JSON.stringify(chatContent) } }] } : { error: { message: "Provider rejected credentials", type: "authentication_error" } }));
    } else {
      response.end(JSON.stringify(imageResponse));
    }
  });
  origin = await listen(provider);
  assetServer = createServer((request, response) => {
    assetAuth = request.headers.authorization || request.headers["x-goog-api-key"] as string | undefined;
    response.setHeader("Content-Type", "image/png");
    response.end(Buffer.from(png, "base64"));
  });
  assetOrigin = await listen(assetServer);
  process.env.DEEPSEEK_BASE_URL = `${origin}/v1`;
  followup = (await import("../app/api/followup/route")).POST;
  analyze = (await import("../app/api/analyze/route")).POST;
  ask = (await import("../app/api/ask/route")).POST;
  image = (await import("../app/api/image/route")).POST;
});

after(async () => {
  for (const server of [provider, assetServer]) {
    if (!server) continue;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function request(body: unknown) {
  return new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `test-${requestId++}` }, body: JSON.stringify(body) });
}

const dream = { selectedAnalyst: "jung", dreamText: "I walked beside a quiet ocean and saw an empty house.", questionIndex: 0 };

test("followup and inner questions return structured provider responses", async () => {
  chatContent = { analystKey: "jung", analystName: "Jung", question: "What did the ocean feel like?" };
  const result = await followup(request(dream));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).question, "What did the ocean feel like?");
  chatContent = { answer: "A quiet reflection.", updatedProfile: "A profile.", reflection: "A thought." };
  assert.equal((await ask(request({ question: "What does the sea mean?", history: [] }))).status, 200);
});

test("analysis returns usable content and does not retry rejected credentials", async () => {
  chatContent = { title: "The ocean", opening: "An opening", readings: [], motifs: ["ocean"] };
  const input = { ...dream, followupAnswers: Array.from({ length: 5 }, () => ({ question: "A question", answer: "An answer" })) };
  const result = await analyze(request(input));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).readings[0].key, "jung");
  chatStatus = 401;
  const count = chatRequests;
  assert.equal((await analyze(request(input))).status, 503);
  assert.equal(chatRequests - count, 1);
  chatStatus = 200;
});

test("invalid requests and invalid model content fail without reporting success", async () => {
  assert.equal((await followup(request({ ...dream, selectedAnalyst: "unknown" }))).status, 400);
  assert.equal((await followup(request({ ...dream, questionIndex: 0.5 }))).status, 400);
  assert.equal((await followup(request(null))).status, 400);
  assert.equal((await ask(request({ question: "A question", history: Array(3).fill({}) }))).status, 400);
  chatContent = { question: "" };
  assert.equal((await followup(request(dream))).status, 502);
});

test("OpenAI image responses support full endpoints and GPT image parameters", async () => {
  process.env.GEMINI_IMAGE_API_STYLE = "openai";
  process.env.GEMINI_IMAGE_ENDPOINT = `${origin}/v1/images/generations?source=test`;
  process.env.GEMINI_IMAGE_MODEL = "gpt-image-test";
  imageResponse = { data: [{ b64_json: png }] };
  const result = await image(request({ prompt: "A quiet ocean at night" }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).imageUrl, `data:image/png;base64,${png}`);
  assert.equal(lastBody.response_format, undefined);
});

test("Seedream sends its supported image options and reads the returned image URL", async () => {
  process.env.GEMINI_IMAGE_API_STYLE = "openai";
  process.env.GEMINI_IMAGE_ENDPOINT = `${origin}/api/v3/images/generations`;
  process.env.GEMINI_IMAGE_MODEL = "doubao-seedream-5-0-pro-260628";
  delete process.env.GEMINI_IMAGE_SIZE;
  delete process.env.GEMINI_IMAGE_RESPONSE_FORMAT;
  imageResponse = { data: [{ url: `${assetOrigin}/seedream.jpg` }] };
  const result = await image(request({ prompt: "A quiet ocean at night" }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).imageUrl, `data:image/png;base64,${png}`);
  assert.equal(lastBody.size, "2K");
  assert.equal(lastBody.response_format, "url");
  assert.equal(lastBody.stream, false);
  assert.equal(lastBody.watermark, true);
  assert.equal(lastBody.n, undefined);
  assert.equal(lastBody.image, undefined);
  assert.equal(assetAuth, undefined);
});

test("Gemini inline and file images work without sending keys to a different origin", async () => {
  process.env.GEMINI_IMAGE_API_STYLE = "gemini";
  process.env.GEMINI_IMAGE_AUTH_HEADER = "x-goog-api-key";
  process.env.GEMINI_IMAGE_ENDPOINT = "";
  process.env.GEMINI_IMAGE_BASE_URL = `${origin}/v1beta`;
  process.env.GEMINI_IMAGE_MODEL = "test-image";
  imageResponse = { candidates: [{ content: { parts: [{ inline_data: { data: png, mime_type: "image/png" } }] } }] };
  assert.equal((await image(request({ prompt: "A quiet ocean at night" }))).status, 200);
  imageResponse = { candidates: [{ content: { parts: [{ fileData: { fileUri: `${assetOrigin}/image`, mimeType: "image/png" } }] } }] };
  const result = await image(request({ prompt: "A quiet ocean at night" }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).imageUrl, `data:image/png;base64,${png}`);
  assert.equal(assetAuth, undefined);
});

test("missing configuration reports unavailable and does not make upstream calls", async () => {
  process.env.DEEPSEEK_API_KEY = "";
  process.env.GEMINI_IMAGE_API_KEY = "";
  const count = chatRequests;
  assert.equal((await followup(request(dream))).status, 503);
  assert.equal((await image(request({ prompt: "A quiet ocean at night" }))).status, 503);
  assert.equal(chatRequests, count);
});

test("image URL resolution preserves explicit endpoints and query parameters", () => {
  const config = resolveImageConfig({ GEMINI_IMAGE_BASE_URL: "https://image.example/v1/images/generations?api-version=1" });
  assert.equal(config.endpoint, "https://image.example/v1/images/generations?api-version=1");
  assert.equal(config.authHeader, "authorization");
  assert.equal(resolveImageConfig({ GEMINI_IMAGE_ENDPOINT: "https://image.example/custom" }).endpoint, "https://image.example/custom");
});
