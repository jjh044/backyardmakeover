import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile(".env.local");
loadEnvFile(".env");

const port = Number(process.env.PORT ?? 8787);
const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";

const stylePrompts = {
  "zen-retreat":
    "a serene zen retreat with refined stone pathways, layered evergreen planting, calm seating, subtle water-feature inspiration, and warm low-voltage lighting",
  "luxury-resort":
    "a luxury resort-style backyard with upscale outdoor lounge furniture, elegant hardscaping, poolside-inspired polish, architectural lighting, and high-end landscaping",
  "tropical-oasis":
    "a tropical oasis with lush layered planting, palms and broad-leaf greenery, resort-like seating, natural stone, and warm inviting lighting",
  "cozy-family-yard":
    "a cozy family backyard with comfortable durable seating, safe open play space, soft planting borders, practical dining space, and warm evening lighting",
};

createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      configured: Boolean(process.env.OPENAI_API_KEY),
      model,
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/makeover") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured on the AI backend.");
    }

    const body = await readJson(request);
    const image = typeof body.image === "string" ? body.image : "";
    const imageType = typeof body.imageType === "string" ? body.imageType : "image/png";
    const style = typeof body.style === "string" ? body.style : "cozy-family-yard";

    if (!image.startsWith("data:image/")) {
      throw new Error("A backyard image is required.");
    }

    const imageBuffer = dataUrlToBuffer(image);

    if (imageBuffer.byteLength < 10_000) {
      throw new Error("Please upload a real backyard photo. Very small placeholder images cannot be transformed.");
    }

    const formData = new FormData();
    formData.append("model", model);
    formData.append(
      "image",
      new Blob([imageBuffer], { type: contentTypeFromDataUrl(image, imageType) }),
      "backyard.png",
    );
    formData.append("prompt", promptForStyle(style));
    formData.append("size", "1024x1024");
    formData.append("quality", "medium");
    formData.append("output_format", "png");

    const openAiResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!openAiResponse.ok) {
      throw new Error(await openAiErrorMessage(openAiResponse));
    }

    const payload = await openAiResponse.json();
    const imageBase64 = payload?.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("OpenAI did not return a generated image.");
    }

    sendJson(response, 200, {
      image: `data:image/png;base64,${imageBase64}`,
    });
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "The AI makeover could not be generated.",
    });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`AI makeover backend listening on http://127.0.0.1:${port}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not configured. Generation requests will fail until it is set.");
  }
});

function loadEnvFile(fileName) {
  const filePath = resolve(fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").replace(/^["']|["']$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function promptForStyle(style) {
  return [
    "Transform the uploaded backyard photo into a realistic, professional landscape design rendering.",
    "Keep the same camera angle, property boundaries, house, fence lines, and general layout recognizable.",
    `Apply this design direction: ${stylePrompts[style] ?? stylePrompts["cozy-family-yard"]}.`,
    "The final image should look photorealistic, high-end, buildable, and suitable for a homeowner design proposal.",
    "Do not add text, labels, watermarks, people, logos, cartoon elements, or unrealistic fantasy objects.",
  ].join(" ");
}

async function openAiErrorMessage(response) {
  const details = await response.text();

  try {
    const payload = JSON.parse(details);
    const error = payload?.error;
    const code = error?.code;
    const message = error?.message;

    if (code === "billing_hard_limit_reached") {
      return "OpenAI billing hard limit has been reached. Add credits or raise the project billing limit in the OpenAI platform, then try Generate again.";
    }

    if (code === "invalid_api_key") {
      return "The OpenAI API key is invalid. Update OPENAI_API_KEY in .env.local, restart npm run dev:all, then try again.";
    }

    if (code === "model_not_found") {
      return `The configured OpenAI image model (${model}) is not available for this API key. Update OPENAI_IMAGE_MODEL in .env.local.`;
    }

    return message ? `OpenAI image generation failed: ${message}` : details;
  } catch {
    return details || "OpenAI image generation failed.";
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_000_000) {
        reject(new Error("The uploaded image is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid request body."));
      }
    });
    request.on("error", reject);
  });
}

function dataUrlToBuffer(dataUrl) {
  const [, base64] = dataUrl.split(",");

  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function contentTypeFromDataUrl(dataUrl, fallbackType) {
  const [metadata, base64] = dataUrl.split(",");

  if (!base64) {
    throw new Error("Invalid image data.");
  }

  return metadata.match(/^data:(.*);base64$/)?.[1] ?? fallbackType;
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}
