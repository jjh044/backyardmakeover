import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Authenticated,
  Unauthenticated,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import {
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/clerk-react";
import {
  ArrowRight,
  ImagePlus,
  Loader2,
  Palmtree,
  Sofa,
  Sparkles,
  Waves,
  UploadCloud,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { assertAiBackendReady, generateMakeoverWithAi } from "./aiMakeover";
import type { Id } from "../convex/_generated/dataModel";

const styles = [
  {
    id: "zen-retreat",
    name: "Zen Retreat",
    description: "Still water, sculpted greenery, stone paths.",
    icon: Waves,
  },
  {
    id: "luxury-resort",
    name: "Luxury Resort",
    description: "Poolside polish, loungers, ambient lighting.",
    icon: Sparkles,
  },
  {
    id: "tropical-oasis",
    name: "Tropical Oasis",
    description: "Lush palms, vivid plants, vacation energy.",
    icon: Palmtree,
  },
  {
    id: "cozy-family-yard",
    name: "Cozy Family Yard",
    description: "Warm seating, play space, practical comfort.",
    icon: Sofa,
  },
] as const;

type MakeoverStyle = (typeof styles)[number]["id"];

type MakeoverRequest = {
  _id: string;
  style: MakeoverStyle;
  status: "uploaded" | "generating" | "complete" | "failed";
  originalImageUrl: string | null;
  resultImageUrl: string | null;
};

function App() {
  return (
    <>
      <Unauthenticated>
        <Welcome />
      </Unauthenticated>
      <Authenticated>
        <MakeoverStudio />
      </Authenticated>
    </>
  );
}

export function Welcome() {
  return (
    <main className="welcome-page">
      <section className="welcome-hero">
        <div>
          <p className="eyebrow">Backyard Makeover</p>
          <h1>See a warmer future for your backyard.</h1>
          <p className="hero-copy">
            Upload a backyard photo, choose the feeling you want, and create a
            polished makeover concept that still feels like home.
          </p>
          <div className="auth-actions">
            <SignUpButton mode="modal">
              <button className="primary-button">
                Create account
                <ArrowRight aria-hidden="true" />
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="secondary-button">Sign in</button>
            </SignInButton>
          </div>
        </div>
      </section>
    </main>
  );
}

export function LocalApp({ hasAccount = false }: { hasAccount?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const storedPreviewUrls = useRef<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] =
    useState<MakeoverStyle>("zen-retreat");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<MakeoverRequest[]>([]);

  const previewUrl = useMemo(() => {
    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      for (const url of storedPreviewUrls.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose a backyard photo before generating.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await assertAiBackendReady();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The AI backend is not ready.",
      );
      setIsSubmitting(false);
      return;
    }

    const requestId = crypto.randomUUID();
    const currentFile = file;
    const currentStyle = selectedStyle;
    const uploadedImageUrl = URL.createObjectURL(currentFile);
    storedPreviewUrls.current.push(uploadedImageUrl);

    setRequests((currentRequests) => [
      {
        _id: requestId,
        style: currentStyle,
        status: "generating",
        originalImageUrl: uploadedImageUrl,
        resultImageUrl: null,
      },
      ...currentRequests,
    ]);

    setFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    try {
      const resultBlob = await generateMakeoverWithAi({
        file: currentFile,
        style: currentStyle,
      });
      const resultImageUrl = URL.createObjectURL(resultBlob);
      storedPreviewUrls.current.push(resultImageUrl);

      setRequests((currentRequests) =>
        currentRequests.map((request) =>
          request._id === requestId
            ? {
                ...request,
                status: "complete",
                resultImageUrl,
              }
            : request,
        ),
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The AI makeover could not be generated.";

      setError(message);
      setRequests((currentRequests) =>
        currentRequests.map((request) =>
          request._id === requestId
            ? {
                ...request,
                status: "failed",
              }
            : request,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <StudioHeader hasAccount={hasAccount} isLocal={!hasAccount} />

      <section className="workspace">
        <UploadPanel
          error={error}
          inputRef={inputRef}
          isSubmitting={isSubmitting}
          onFileChange={setFile}
          onSubmit={handleSubmit}
          previewUrl={previewUrl}
          selectedStyle={selectedStyle}
          setSelectedStyle={setSelectedStyle}
        />

        <ResultsPanel requests={requests} />
      </section>
    </main>
  );
}

function MakeoverStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] =
    useState<MakeoverStyle>("zen-retreat");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requests = useQuery(api.makeovers.listMine) as
    | MakeoverRequest[]
    | undefined;
  const generateUploadUrl = useMutation(api.makeovers.generateUploadUrl);
  const createMakeover = useMutation(api.makeovers.create);
  const markGenerating = useMutation(api.makeovers.markGenerating);
  const failMakeover = useMutation(api.makeovers.fail);
  const generateAiMakeover = useAction(api.makeovers.generateAiMakeover);

  const previewUrl = useMemo(() => {
    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose a backyard photo before generating.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let requestId: Id<"makeoverRequests"> | null = null;

    try {
      const currentFile = file;
      const currentStyle = selectedStyle;
      const uploadUrl = await generateUploadUrl();
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": currentFile.type },
        body: currentFile,
      });

      if (!uploadResult.ok) {
        throw new Error("The backyard photo could not be uploaded.");
      }

      const { storageId } = (await uploadResult.json()) as {
        storageId: Id<"_storage">;
      };
      requestId = await createMakeover({
        originalImageId: storageId,
        style: currentStyle,
      });

      await markGenerating({ id: requestId });
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      void generateAiMakeover({ id: requestId }).catch((generationError) => {
        setError(
          generationError instanceof Error
            ? generationError.message
            : "The AI makeover could not be generated.",
        );
      });
    } catch (caughtError) {
      if (requestId) {
        await failMakeover({
          id: requestId,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Generation failed.",
        });
      }

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while creating the makeover.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <StudioHeader />

      <section className="workspace">
        <UploadPanel
          error={error}
          inputRef={inputRef}
          isSubmitting={isSubmitting}
          onFileChange={setFile}
          onSubmit={handleSubmit}
          previewUrl={previewUrl}
          selectedStyle={selectedStyle}
          setSelectedStyle={setSelectedStyle}
        />

        <ResultsPanel requests={requests} />
      </section>
    </main>
  );
}

function UploadPanel({
  error,
  inputRef,
  isSubmitting,
  onFileChange,
  onSubmit,
  previewUrl,
  selectedStyle,
  setSelectedStyle,
}: {
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  previewUrl: string | null;
  selectedStyle: MakeoverStyle;
  setSelectedStyle: (style: MakeoverStyle) => void;
}) {
  return (
    <form className="upload-panel" onSubmit={onSubmit}>
      <button
        className="upload-zone"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Selected backyard preview" />
        ) : (
          <span>
            <UploadCloud aria-hidden="true" />
            <strong>Upload backyard photo</strong>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />

      <fieldset>
        <legend>Style type</legend>
        <StyleGrid selectedStyle={selectedStyle} onSelect={setSelectedStyle} />
      </fieldset>

      {error && <p className="error-message">{error}</p>}

      <button className="generate-button" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="spin" aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        Generate
      </button>
    </form>
  );
}

function StudioHeader({
  hasAccount = false,
  isLocal = false,
}: {
  hasAccount?: boolean;
  isLocal?: boolean;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Backyard Makeover</p>
        <h1>Design studio</h1>
      </div>
      {hasAccount ? (
        <UserButton />
      ) : isLocal ? (
        <span className="status-pill">Local studio</span>
      ) : (
        <UserButton />
      )}
    </header>
  );
}

function StyleGrid({
  selectedStyle,
  onSelect,
}: {
  selectedStyle: MakeoverStyle;
  onSelect: (style: MakeoverStyle) => void;
}) {
  return (
    <div className="style-grid">
      {styles.map((style) => {
        const Icon = style.icon;

        return (
          <label
            className="style-option"
            data-selected={selectedStyle === style.id}
            key={style.id}
          >
            <input
              checked={selectedStyle === style.id}
              name="style"
              onChange={() => onSelect(style.id)}
              type="radio"
              value={style.id}
            />
            <Icon aria-hidden="true" />
            <span>{style.name}</span>
            <small>{style.description}</small>
          </label>
        );
      })}
    </div>
  );
}

function ResultsPanel({
  requests,
}: {
  requests: MakeoverRequest[] | undefined;
}) {
  return (
    <section className="results-panel" aria-label="Generated makeovers">
      <div className="section-heading">
        <div>
          <h2>Results</h2>
          <p>Saved concepts and makeovers in progress.</p>
        </div>
        <span>{requests?.length ?? 0} projects</span>
      </div>
      <div className="results-grid">
        {requests === undefined && (
          <div className="empty-state">Loading projects...</div>
        )}
        {requests?.length === 0 && (
          <div className="empty-state">
            <ImagePlus aria-hidden="true" />
            <span>Your generated makeovers will appear here.</span>
          </div>
        )}
        {requests?.map((request) => (
          <article className="result-card" key={request._id}>
            {request.resultImageUrl ? (
              <img
                src={request.resultImageUrl}
                alt="AI-generated backyard makeover"
              />
            ) : request.status === "failed" ? (
              <div className="failed-preview">
                <ImagePlus aria-hidden="true" />
                <span>Generation failed</span>
              </div>
            ) : (
              <div className="pending-preview">
                <img
                  src={request.originalImageUrl ?? ""}
                  alt="Uploaded backyard"
                />
                <span>{request.status}</span>
              </div>
            )}
            <div>
              <h3>{labelForStyle(request.style)}</h3>
              <p>{statusCopy(request.status)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function labelForStyle(styleId: MakeoverStyle) {
  return styles.find((style) => style.id === styleId)?.name ?? "Custom style";
}

function statusCopy(status: string) {
  if (status === "complete") {
    return "Makeover complete";
  }

  if (status === "failed") {
    return "Generation failed";
  }

  if (status === "generating") {
    return "AI is redesigning your backyard";
  }

  return "Photo uploaded";
}

export default App;
