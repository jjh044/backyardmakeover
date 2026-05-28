export type MakeoverStyle =
  | "zen-retreat"
  | "luxury-resort"
  | "tropical-oasis"
  | "cozy-family-yard";

const defaultEndpoint = "http://127.0.0.1:8787/api/makeover";

export async function assertAiBackendReady() {
  const endpoint = import.meta.env.VITE_AI_MAKEOVER_ENDPOINT ?? defaultEndpoint;
  const healthEndpoint = endpoint.replace(/\/api\/makeover$/, "/api/health");

  let response: Response;

  try {
    response = await fetch(healthEndpoint);
  } catch {
    throw new Error(
      `The AI makeover backend is not reachable at ${endpoint}. Start it with npm run dev:ai or npm run dev:all.`,
    );
  }

  const status = (await response.json().catch(() => null)) as
    | { configured?: boolean }
    | null;

  if (!response.ok || !status?.configured) {
    throw new Error(
      "The AI backend is running, but OPENAI_API_KEY is not configured. Add OPENAI_API_KEY to .env.local and restart npm run dev:all.",
    );
  }
}

export async function generateMakeoverWithAi({
  file,
  style,
}: {
  file: File;
  style: MakeoverStyle;
}) {
  await assertAiBackendReady();

  const endpoint = import.meta.env.VITE_AI_MAKEOVER_ENDPOINT ?? defaultEndpoint;
  const payload = {
    image: await fileToDataUrl(file),
    imageType: file.type || "image/png",
    style,
  };

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `The AI makeover backend is not reachable at ${endpoint}. Start it with npm run dev:ai and make sure OPENAI_API_KEY is set.`,
    );
  }

  const result = (await response.json().catch(() => null)) as
    | { image?: string; error?: string }
    | null;

  if (!response.ok || !result?.image) {
    throw new Error(result?.error ?? "The AI makeover could not be generated.");
  }

  return dataUrlToBlob(result.image);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("The uploaded photo could not be read."));
      }
    };
    reader.onerror = () => reject(new Error("The uploaded photo could not be read."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [metadata, base64] = dataUrl.split(",");
  const contentType = metadata.match(/^data:(.*);base64$/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}
