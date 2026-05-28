import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  useAuth,
} from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App, { LocalApp, Welcome } from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Root() {
  if (!clerkPublishableKey) {
    return <LocalApp />;
  }

  if (!convexUrl) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <SignedOut>
          <Welcome />
        </SignedOut>
        <SignedIn>
          <LocalApp hasAccount />
        </SignedIn>
      </ClerkProvider>
    );
  }

  const convex = new ConvexReactClient(convexUrl);
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
