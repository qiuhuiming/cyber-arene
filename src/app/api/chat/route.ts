import {
  createOpenAICompatibleRequester,
  type OpenAIChatCompletionRequest,
} from "@/chat/chat-core";
import { getProvider, loadModelProvidersConfig } from "@/config/model-providers";

export const runtime = "nodejs";

type RequestBody = {
  providerKey?: string;
  payload?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const providerKey = typeof body.providerKey === "string" ? body.providerKey : "";
    if (!providerKey.trim()) {
      return Response.json({ error: "Missing providerKey." }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== "object") {
      return Response.json({ error: "Missing payload." }, { status: 400 });
    }

    const config = loadModelProvidersConfig();
    const provider = getProvider(config, providerKey);

    const requester = createOpenAICompatibleRequester({
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      fetchFn: fetch,
    });

    const upstream = await requester(body.payload as OpenAIChatCompletionRequest);

    const contentType = upstream.headers.get("content-type") ?? "";
    const headers = new Headers();
    if (contentType) {
      headers.set("content-type", contentType);
    }
    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) {
      headers.set("cache-control", cacheControl);
    }
    if (contentType.includes("text/event-stream")) {
      headers.set("connection", "keep-alive");
      headers.set("x-accel-buffering", "no");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Chat proxy failed.",
      },
      { status: 500 },
    );
  }
}
