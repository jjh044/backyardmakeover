import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { makeoverStyle } from "./schema";

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("You must be signed in to use Backyard Makeover.");
  }

  return identity.subject;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    originalImageId: v.id("_storage"),
    style: makeoverStyle,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    return await ctx.db.insert("makeoverRequests", {
      userId,
      style: args.style,
      originalImageId: args.originalImageId,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const requests = await ctx.db
      .query("makeoverRequests")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(12);

    return await Promise.all(
      requests.map(async (request) => ({
        ...request,
        originalImageUrl: await ctx.storage.getUrl(request.originalImageId),
        resultImageUrl: request.resultImageId
          ? await ctx.storage.getUrl(request.resultImageId)
          : null,
      })),
    );
  },
});

export const getForGeneration = query({
  args: {
    id: v.id("makeoverRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const request = await ctx.db.get(args.id);

    if (!request || request.userId !== userId) {
      throw new Error("Makeover request not found.");
    }

    return {
      originalImageId: request.originalImageId,
      style: request.style,
      status: request.status,
    };
  },
});

export const generateAiMakeover = action({
  args: {
    id: v.id("makeoverRequests"),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      await ctx.runMutation(api.makeovers.fail, {
        id: args.id,
        error: "OPENAI_API_KEY is not configured.",
      });
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    try {
      const request = await ctx.runQuery(api.makeovers.getForGeneration, {
        id: args.id,
      });
      const originalImage = await ctx.storage.get(request.originalImageId);

      if (!originalImage) {
        throw new Error("The original backyard photo could not be loaded.");
      }

      const formData = new FormData();
      formData.append("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5");
      formData.append("image", originalImage, "backyard.png");
      formData.append("prompt", promptForStyle(request.style));
      formData.append("size", "1024x1024");
      formData.append("quality", "medium");
      formData.append("output_format", "png");

      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`OpenAI image generation failed: ${details}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
      };
      const imageBase64 = payload.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new Error("OpenAI did not return an image.");
      }

      const resultImageId = await ctx.storage.store(
        base64ToBlob(imageBase64, "image/png"),
      );

      await ctx.runMutation(api.makeovers.complete, {
        id: args.id,
        resultImageId,
      });
    } catch (error) {
      await ctx.runMutation(api.makeovers.fail, {
        id: args.id,
        error:
          error instanceof Error
            ? error.message
            : "AI makeover generation failed.",
      });
      throw error;
    }
  },
});

export const markGenerating = mutation({
  args: {
    id: v.id("makeoverRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const request = await ctx.db.get(args.id);

    if (!request || request.userId !== userId) {
      throw new Error("Makeover request not found.");
    }

    await ctx.db.patch(args.id, {
      status: "generating",
      updatedAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: {
    id: v.id("makeoverRequests"),
    resultImageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const request = await ctx.db.get(args.id);

    if (!request || request.userId !== userId) {
      throw new Error("Makeover request not found.");
    }

    await ctx.db.patch(args.id, {
      resultImageId: args.resultImageId,
      status: "complete",
      updatedAt: Date.now(),
    });
  },
});

export const fail = mutation({
  args: {
    id: v.id("makeoverRequests"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const request = await ctx.db.get(args.id);

    if (!request || request.userId !== userId) {
      throw new Error("Makeover request not found.");
    }

    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

function promptForStyle(style: string) {
  const styleBriefs: Record<string, string> = {
    "zen-retreat":
      "a serene zen retreat with refined stone pathways, layered evergreen planting, calm seating, subtle water-feature inspiration, and warm low-voltage lighting",
    "luxury-resort":
      "a luxury resort-style backyard with upscale outdoor lounge furniture, elegant hardscaping, poolside-inspired polish, architectural lighting, and high-end landscaping",
    "tropical-oasis":
      "a tropical oasis with lush layered planting, palms and broad-leaf greenery, resort-like seating, natural stone, and warm inviting lighting",
    "cozy-family-yard":
      "a cozy family backyard with comfortable durable seating, safe open play space, soft planting borders, practical dining space, and warm evening lighting",
  };

  return [
    "Transform the uploaded backyard photo into a realistic, professional landscape design rendering.",
    "Keep the same camera angle, property boundaries, house, fence lines, and general layout recognizable.",
    `Apply this design direction: ${styleBriefs[style] ?? styleBriefs["cozy-family-yard"]}.`,
    "The final image should look photorealistic, high-end, buildable, and suitable for a homeowner design proposal.",
    "Do not add text, labels, watermarks, people, logos, cartoon elements, or unrealistic fantasy objects.",
  ].join(" ");
}

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}
