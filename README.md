# Backyard Makeover App

React + Convex starter for uploading a backyard photo, selecting a makeover style, and storing each generation request under the signed-in user.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill in the frontend values:

   ```bash
   VITE_CONVEX_URL=
   VITE_CLERK_PUBLISHABLE_KEY=
   VITE_AI_MAKEOVER_ENDPOINT=http://127.0.0.1:8787/api/makeover
   ```

3. Start the standalone AI makeover backend. This does not require Convex:

   ```bash
   OPENAI_API_KEY=your-openai-api-key npm run dev:ai
   ```

   In PowerShell:

   ```powershell
   $env:OPENAI_API_KEY="your-openai-api-key"; npm run dev:ai
   ```

   Or put `OPENAI_API_KEY=your-openai-api-key` in `.env.local` and start both
   the AI backend and Vite app together:

   ```bash
   npm run dev:all
   ```

4. Optional: set the Clerk issuer domain in Convex:

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN your-clerk-issuer-domain
   ```

5. Optional: set the OpenAI key used by the Convex backend for stored AI backyard makeovers:

   ```bash
   npx convex env set OPENAI_API_KEY your-openai-api-key
   npx convex env set OPENAI_IMAGE_MODEL gpt-image-1.5
   ```

6. Optional: start Convex and generate the local Convex client files:

   ```bash
   npx convex dev
   ```

7. Start the app:

   ```bash
   npm run dev
   ```

## Current Flow

- User uploads a backyard image.
- User selects Zen Retreat, Luxury Resort, Tropical Oasis, or Cozy Family Yard.
- The app sends the image and selected style to the AI makeover endpoint.
- The AI backend sends the uploaded photo to OpenAI for a realistic backyard transformation.
- The returned generated image is displayed in Results.
- If Convex is configured, requests can also be stored under the signed-in user.
