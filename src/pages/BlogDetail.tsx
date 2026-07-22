import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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

const BlogDetail = () => {
  const { id } = useParams<{ id: string }>();
  const blogId = id as Id<"blogs"> | undefined;

  const blog = useQuery(api.blog.getBlog, blogId ? { blogId } : "skip");
  const categories = useQuery(api.blogCategory.listBlogCategories);
  const coaches = useQuery(api.coach.listCoaches);

  const updateBlog = useMutation(api.blog.updateBlog);
  const publishBlog = useMutation(api.blog.publishBlog);
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
  const [initialized, setInitialized] = useState(false);

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const tempImageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!blog || initialized) return;
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
  }, [blog, initialized]);

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
      tempImageUrlRef.current = null;
    }
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

  if (blog === undefined) {
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

  const isDraft = blog.status === "draft" && !blog.publishedSnapshot;
  const formReady =
    title.trim().length > 0 &&
    titleAr.trim().length > 0 &&
    simpleContent.trim().length > 0 &&
    simpleContentAr.trim().length > 0 &&
    body.trim().length > 0 &&
    bodyAr.trim().length > 0 &&
    Boolean(imagePreviewUrl);
  const showPublishButton = formReady && (isDraft || blog.hasUnpublishedChanges);

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
          <Button variant="outline" onClick={() => handleSave()} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          {showPublishButton && (
            <Button variant="cta" onClick={handlePublish} disabled={isPublishing || isSaving}>
              <Upload className="mr-2 h-4 w-4" />
              {isPublishing
                ? "Publishing…"
                : blog.hasUnpublishedChanges
                  ? "Publish changes"
                  : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="max-w-3xl space-y-4 rounded-xl border bg-card p-6">
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
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Author (coach)</Label>
              <Select value={authorId} onValueChange={setAuthorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select author" />
                </SelectTrigger>
                <SelectContent>
                  {(coaches ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
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

        <div className="max-w-3xl space-y-4 rounded-xl border bg-card p-6">
          <h2 className="font-medium">Simple content (excerpt)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="simple">English</Label>
              <Textarea
                id="simple"
                value={simpleContent}
                onChange={(e) => setSimpleContent(e.target.value)}
                rows={4}
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="simple-ar">Arabic</Label>
              <Textarea
                id="simple-ar"
                value={simpleContentAr}
                dir="rtl"
                onChange={(e) => setSimpleContentAr(e.target.value)}
                rows={4}
                maxLength={1000}
              />
            </div>
          </div>
        </div>

        <div className="max-w-3xl space-y-4 rounded-xl border bg-card p-6">
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

        <div className="max-w-3xl space-y-4 rounded-xl border bg-card p-6">
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
    </div>
  );
};

export default BlogDetail;
