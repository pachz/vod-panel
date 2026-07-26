import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, Copy, EyeOff, Upload } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageDropzone, type ImageUploadState } from "@/components/ImageDropzone";
import { RichTextarea } from "@/components/RichTextarea";
import { blogUpdateSchema } from "../../shared/validation/blog";
import { cn } from "@/lib/utils";

function getMissingPublishFields(fields: {
  title: string;
  titleAr: string;
  simpleContent: string;
  simpleContentAr: string;
  body: string;
  bodyAr: string;
  hasImage: boolean;
}): string[] {
  const missing: string[] = [];
  if (!fields.title.trim()) missing.push("Title (English)");
  if (!fields.titleAr.trim()) missing.push("Title (Arabic)");
  if (!fields.simpleContent.trim()) missing.push("Excerpt (English)");
  if (!fields.simpleContentAr.trim()) missing.push("Excerpt (Arabic)");
  if (!fields.body.trim()) missing.push("Full content (English)");
  if (!fields.bodyAr.trim()) missing.push("Full content (Arabic)");
  if (!fields.hasImage) missing.push("Featured image");
  return missing;
}

const ShareIconButton = ({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className: string;
  children: ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    className={cn(
      "flex h-9 w-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90",
      className,
    )}
  >
    {children}
  </a>
);

const BlogDetail = () => {
  const { id } = useParams<{ id: string }>();
  const blogId = id as Id<"blogs"> | undefined;

  const blog = useQuery(api.blog.getBlog, blogId ? { blogId } : "skip");
  const categories = useQuery(api.blogCategory.listBlogCategories);
  const coaches = useQuery(api.coach.listCoaches);

  const updateBlog = useMutation(api.blog.updateBlog);
  const publishBlog = useMutation(api.blog.publishBlog);
  const unpublishBlog = useMutation(api.blog.unpublishBlog);
  const generateImageUploadUrl = useMutation(api.blog.generateBlogImageUploadUrl);
  const updateBlogImages = useMutation(api.blog.updateBlogImages);
  const convertToJpeg = useAction(api.image.convertToJpeg);
  const generateThumbnail = useAction(api.image.generateThumbnail);

  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [simpleContent, setSimpleContent] = useState("");
  const [simpleContentAr, setSimpleContentAr] = useState("");
  const [body, setBody] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [readingTimeMinutes, setReadingTimeMinutes] = useState("5");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const tempImageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!blog || categories === undefined || coaches === undefined || initialized) {
      return;
    }
    setTitle(blog.title);
    setTitleAr(blog.title_ar);
    setSimpleContent(blog.simple_content);
    setSimpleContentAr(blog.simple_content_ar);
    setBody(blog.body);
    setBodyAr(blog.body_ar);
    setCategoryId(blog.category_id);
    setAuthorId(blog.author_id);
    setReadingTimeMinutes(String(blog.reading_time_minutes));
    setImagePreviewUrl(blog.image_url ?? blog.thumbnail_image_url ?? null);
    setInitialized(true);
  }, [blog, categories, coaches, initialized]);

  useEffect(() => {
    setInitialized(false);
  }, [blogId]);

  useEffect(() => {
    return () => {
      if (tempImageUrlRef.current) {
        URL.revokeObjectURL(tempImageUrlRef.current);
      }
    };
  }, []);

  const resetTempPreview = () => {
    if (tempImageUrlRef.current) {
      URL.revokeObjectURL(tempImageUrlRef.current);
    }
    tempImageUrlRef.current = null;
  };

  const getErrorMessage = (error: unknown) => {
    if (error && typeof error === "object" && "data" in error) {
      const data = (error as { data?: { message?: string } }).data;
      if (data?.message) return data.message;
    }
    if (error instanceof Error && error.message) return error.message;
    return "Something went wrong.";
  };

  const uploadFileWithProgress = (
    uploadUrl: string,
    file: File,
    onProgress: (progress: number) => void,
  ) =>
    new Promise<{ storageId: string }>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(event.loaded / event.total);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText) as { storageId?: string };
              if (!response.storageId) {
                reject(new Error("Upload succeeded but no storage ID was returned."));
                return;
              }
              resolve({ storageId: response.storageId });
            } catch {
              reject(new Error("Could not parse upload response."));
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}.`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(file);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Unexpected upload error."));
      }
    });

  const handleImageSelect = async (file: File) => {
    if (!blogId || !blog) return;

    resetTempPreview();
    const previewUrl = URL.createObjectURL(file);
    tempImageUrlRef.current = previewUrl;
    setImagePreviewUrl(previewUrl);
    setUploadState({ status: "uploading", progress: 0 });

    try {
      const uploadUrl = await generateImageUploadUrl();
      const { storageId: originalStorageId } = await uploadFileWithProgress(
        uploadUrl,
        file,
        (progress) => setUploadState({ status: "uploading", progress: progress * 0.6 }),
      );

      setUploadState({ status: "uploading", progress: 0.65 });
      const convertedStorageId = await convertToJpeg({
        storageId: originalStorageId as Id<"_storage">,
        quality: 85,
      });

      setUploadState({ status: "uploading", progress: 0.8 });
      let thumbnailStorageId: Id<"_storage"> | undefined;
      try {
        thumbnailStorageId = await generateThumbnail({
          storageId: convertedStorageId,
          maxWidth: 640,
          maxHeight: 400,
          quality: 95,
        });
      } catch {
        // Thumbnail is optional; fall back to full image.
      }

      setUploadState({ status: "uploading", progress: 0.95 });
      const result = await updateBlogImages({
        blogId,
        imageStorageId: convertedStorageId,
        thumbnailStorageId,
      });

      resetTempPreview();
      setImagePreviewUrl(result.imageUrl);
      setUploadState({ status: "success", progress: 1 });
      toast.success("Blog image updated.");
      setTimeout(() => setUploadState({ status: "idle", progress: 0 }), 1200);
    } catch (error) {
      resetTempPreview();
      setImagePreviewUrl(blog.image_url ?? blog.thumbnail_image_url ?? null);
      setUploadState({
        status: "error",
        progress: 0,
        errorMessage: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error));
    }
  };

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!blogId) return;

    const parsedReadingTime = Number.parseInt(readingTimeMinutes, 10);
    const result = blogUpdateSchema.safeParse({
      title,
      titleAr,
      simpleContent,
      simpleContentAr,
      body,
      bodyAr,
      categoryId,
      authorId,
      readingTimeMinutes: Number.isFinite(parsedReadingTime) ? parsedReadingTime : NaN,
    });

    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSaving(true);
    try {
      await updateBlog({
        blogId,
        title: result.data.title,
        titleAr: result.data.titleAr,
        simpleContent: result.data.simpleContent,
        simpleContentAr: result.data.simpleContentAr,
        body: result.data.body,
        bodyAr: result.data.bodyAr,
        categoryId: result.data.categoryId as Id<"blogCategories">,
        authorId: result.data.authorId as Id<"coaches">,
        readingTimeMinutes: result.data.readingTimeMinutes,
      });
      toast.success("Blog saved.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!blogId) return;

    const parsedReadingTime = Number.parseInt(readingTimeMinutes, 10);
    const result = blogUpdateSchema.safeParse({
      title,
      titleAr,
      simpleContent,
      simpleContentAr,
      body,
      bodyAr,
      categoryId,
      authorId,
      readingTimeMinutes: Number.isFinite(parsedReadingTime) ? parsedReadingTime : NaN,
    });

    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "Invalid input.");
      return;
    }

    setIsPublishing(true);
    try {
      await updateBlog({
        blogId,
        title: result.data.title,
        titleAr: result.data.titleAr,
        simpleContent: result.data.simpleContent,
        simpleContentAr: result.data.simpleContentAr,
        body: result.data.body,
        bodyAr: result.data.bodyAr,
        categoryId: result.data.categoryId as Id<"blogCategories">,
        authorId: result.data.authorId as Id<"coaches">,
        readingTimeMinutes: result.data.readingTimeMinutes,
      });
      await publishBlog({ blogId });
      toast.success("Blog published.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!blogId) return;

    setIsUnpublishing(true);
    try {
      await unpublishBlog({ blogId });
      toast.success("Blog unpublished.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUnpublishing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!blog?.slug || typeof window === "undefined") return;
    const url = `${window.location.origin}/articles/${blog.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Could not copy link.");
    }
  };

  if (blog === undefined || categories === undefined || coaches === undefined) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Loading blog…
      </div>
    );
  }

  if (blog === null) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/blogs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Blogs
          </Link>
        </Button>
        <p className="text-muted-foreground">Blog not found.</p>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Loading blog…
      </div>
    );
  }

  const isPublished = blog.status === "published";
  const missingPublishFields = getMissingPublishFields({
    title,
    titleAr,
    simpleContent,
    simpleContentAr,
    body,
    bodyAr,
    hasImage: Boolean(imagePreviewUrl),
  });
  const formReady = missingPublishFields.length === 0;
  // Drafts (including unpublished) or published posts with pending edits.
  const canAttemptPublish = blog.status === "draft" || blog.hasUnpublishedChanges;
  const showPublishButton = canAttemptPublish;
  const showPublishBlockedMessage = canAttemptPublish && !formReady;
  const showUnpublishButton = isPublished;
  const publicUrl =
    blog.slug && typeof window !== "undefined"
      ? `${window.location.origin}/articles/${blog.slug}`
      : null;
  const encodedUrl = publicUrl ? encodeURIComponent(publicUrl) : "";
  const encodedTitle = encodeURIComponent(blog.title);
  const savedCategoryName =
    categories?.find((c) => c._id === blog.category_id)?.name ?? "—";
  const savedAuthorName =
    coaches?.find((c) => c._id === blog.author_id)?.name ?? "—";

  const formatTimestamp = (value?: number) =>
    value ? format(new Date(value), "d MMM yyyy, HH:mm") : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/blogs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Blogs
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{blog.title}</h1>
            <Badge variant={blog.status === "published" ? "default" : "secondary"}>
              {blog.status === "published" ? "Published" : "Draft"}
            </Badge>
            {blog.hasUnpublishedChanges && (
              <Badge variant="outline" className="border-amber-300 text-amber-600">
                Unpublished changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{blog.title_ar}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave()}
            disabled={isSaving || isPublishing || isUnpublishing}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
          {showUnpublishButton && (
            <Button
              variant="outline"
              onClick={handleUnpublish}
              disabled={isUnpublishing || isPublishing || isSaving}
            >
              <EyeOff className="mr-2 h-4 w-4" />
              {isUnpublishing ? "Unpublishing…" : "Unpublish"}
            </Button>
          )}
          {showPublishButton && (
            <Button
              variant="cta"
              onClick={handlePublish}
              disabled={!formReady || isPublishing || isUnpublishing || isSaving}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isPublishing
                ? "Publishing…"
                : isPublished && blog.hasUnpublishedChanges
                  ? "Publish changes"
                  : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {showPublishBlockedMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cannot publish yet</AlertTitle>
          <AlertDescription>
            This blog cannot be published. Please complete all required fields
            before publishing: {missingPublishFields.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <h2 className="font-medium">Basic information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title (EN)</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title-ar">Title (AR)</Label>
                <Input
                  id="title-ar"
                  value={titleAr}
                  dir="rtl"
                  onChange={(e) => setTitleAr(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={categoryId || undefined}
                  onValueChange={setCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    {categoryId &&
                      !categories.some((c) => c._id === categoryId) && (
                        <SelectItem value={categoryId}>
                          Current category (unavailable)
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Author (coach)</Label>
                <Select
                  value={authorId || undefined}
                  onValueChange={setAuthorId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select author" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    {authorId && !coaches.some((c) => c._id === authorId) && (
                      <SelectItem value={authorId}>
                        Current author (unavailable)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="max-w-xs space-y-2">
              <Label htmlFor="reading-time">Reading time (minutes)</Label>
              <Input
                id="reading-time"
                type="number"
                min={1}
                max={120}
                value={readingTimeMinutes}
                onChange={(e) => setReadingTimeMinutes(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">Shown as &ldquo;N min read&rdquo;.</p>
            </div>
          </div>

          <div
            className={cn(
              "space-y-4 rounded-xl border bg-card p-6",
              showPublishBlockedMessage &&
                (!simpleContent.trim() || !simpleContentAr.trim()) &&
                "border-destructive/50",
            )}
          >
            <div className="space-y-1">
              <h2 className="font-medium">Excerpt</h2>
              <p className="text-sm text-muted-foreground">
                Required in both languages before publishing.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="simple"
                  className={cn(
                    showPublishBlockedMessage &&
                      !simpleContent.trim() &&
                      "text-destructive",
                  )}
                >
                  English
                </Label>
                <Textarea
                  id="simple"
                  value={simpleContent}
                  onChange={(e) => setSimpleContent(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  aria-invalid={
                    showPublishBlockedMessage && !simpleContent.trim()
                  }
                  className={cn(
                    showPublishBlockedMessage &&
                      !simpleContent.trim() &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="simple-ar"
                  className={cn(
                    showPublishBlockedMessage &&
                      !simpleContentAr.trim() &&
                      "text-destructive",
                  )}
                >
                  Arabic
                </Label>
                <Textarea
                  id="simple-ar"
                  value={simpleContentAr}
                  dir="rtl"
                  onChange={(e) => setSimpleContentAr(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  aria-invalid={
                    showPublishBlockedMessage && !simpleContentAr.trim()
                  }
                  className={cn(
                    showPublishBlockedMessage &&
                      !simpleContentAr.trim() &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-6">
            <h2 className="font-medium">Full rich content</h2>
            <RichTextarea
              id="body"
              label="English body"
              value={body}
              onChange={setBody}
              rows={8}
              maxLength={100_000}
            />
            <RichTextarea
              id="body-ar"
              label="Arabic body"
              value={bodyAr}
              onChange={setBodyAr}
              dir="rtl"
              rows={8}
              maxLength={100_000}
            />
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-6">
            <h2 className="font-medium">Featured image</h2>
            <ImageDropzone
              id="blog-image"
              label="Blog image"
              helperText="Upload a featured image. A thumbnail is generated automatically."
              aspectRatioClass="aspect-video"
              value={imagePreviewUrl}
              onSelectFile={handleImageSelect}
              uploadState={uploadState}
              disabled={isSaving}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Post information</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-end font-medium">
                  {blog.status === "published" ? "Published" : "Draft"}
                  {blog.hasUnpublishedChanges ? (
                    <span className="mt-0.5 block text-xs font-normal text-amber-600">
                      Unpublished changes
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="text-end font-medium">{savedCategoryName}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="text-end font-medium">{savedAuthorName}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Published</dt>
                <dd className="text-end font-medium">{formatTimestamp(blog.publishedAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="text-end font-medium">{formatTimestamp(blog.updatedAt)}</dd>
              </div>
              {blog.slug ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Slug</dt>
                  <dd className="break-all text-end font-medium">{blog.slug}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Share</h2>
            {isPublished && publicUrl ? (
              <>
                <p className="break-all text-xs text-muted-foreground">{publicUrl}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleCopyLink}
                >
                  {linkCopied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy link
                    </>
                  )}
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <ShareIconButton
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                    label="Share on Facebook"
                    className="bg-[#1877F2]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M14 8.2h2.4V5H14c-2.3 0-3.8 1.6-3.8 4v1.7H8.2V14h2V19h2.8v-5h2.2l.4-3.3h-2.6V9.2c0-.6.3-1 1-1z" />
                    </svg>
                  </ShareIconButton>
                  <ShareIconButton
                    href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
                    label="Share on X"
                    className="bg-[#1DA1F2]"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <path d="M22 5.8c-.7.3-1.5.5-2.3.6A4 4 0 0 0 21.4 4c-.8.5-1.7.8-2.6 1a4 4 0 0 0-6.8 3.6A11.3 11.3 0 0 1 3.1 4.7a4 4 0 0 0 1.2 5.3 4 4 0 0 1-1.8-.5v.1a4 4 0 0 0 3.2 3.9 4 4 0 0 1-1.8.1 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 18.1a11.3 11.3 0 0 0 6.1 1.8c7.3 0 11.3-6.1 11.3-11.3v-.5A8 8 0 0 0 22 5.8z" />
                    </svg>
                  </ShareIconButton>
                  <ShareIconButton
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
                    label="Share on LinkedIn"
                    className="bg-[#0A66C2]"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <path d="M6.5 9H3.7v11.3h2.8V9zM5.1 3.7a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM20.3 13.2c0-2.4-1.3-4-3.7-4-1.3 0-2.2.7-2.6 1.4h-.1V9H11.3c0 .8 0 11.3 0 11.3h2.8v-6.3c0-.3 0-.7.1-1 .3-.7.9-1.4 2-1.4 1.4 0 2 1.1 2 2.6v6.1h2.8v-6.3z" />
                    </svg>
                  </ShareIconButton>
                  <ShareIconButton
                    href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
                    label="Share on WhatsApp"
                    className="bg-[#25D366]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M12 2.1A9.9 9.9 0 0 0 3.4 17l-1.1 4 4.1-1.1A9.9 9.9 0 1 0 12 2.1zm5.7 14.1c-.2.7-1.3 1.2-1.8 1.3-.5.1-1 .2-3.4-.7-3-1.1-5-4.4-5.1-4.6-.2-.2-1.3-1.8-1.3-3.4 0-1.6.8-2.4 1.1-2.7.3-.3.7-.4 1-.4h.7c.2 0 .5 0 .7.6l1 2.4c.1.2.1.4 0 .6l-.4.7c-.1.2-.3.4-.1.7.2.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.3.1.5.1.7-.1l.8-1.1c.2-.2.4-.2.7-.1l2.1 1c.2.1.4.2.5.3.1.2.1.8-.2 1.5z" />
                    </svg>
                  </ShareIconButton>
                </div>
                <Button variant="ghost" size="sm" className="w-full" asChild>
                  <Link to={`/articles/${blog.slug}`} target="_blank">
                    Open public page
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Publish this post to get a public link for sharing.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default BlogDetail;
