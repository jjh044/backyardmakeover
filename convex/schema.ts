import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const makeoverStyle = v.union(
  v.literal("zen-retreat"),
  v.literal("luxury-resort"),
  v.literal("tropical-oasis"),
  v.literal("cozy-family-yard"),
);

export default defineSchema({
  makeoverRequests: defineTable({
    userId: v.string(),
    style: makeoverStyle,
    originalImageId: v.id("_storage"),
    resultImageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("uploaded"),
      v.literal("generating"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_status", ["status"]),
});
