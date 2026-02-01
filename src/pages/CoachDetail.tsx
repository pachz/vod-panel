import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Star, Trash2 } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { coachInputSchema, type CoachInput } from "../../shared/validation/coach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ImageDropzone, type ImageUploadState } from "@/components/ImageDropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Id } from "../../convex/_generated/dataModel";

const defaultValues: CoachInput = {
  name: "",
  nameAr: "",
  expertise: "General Coach",
  expertiseAr: "مدرب عام",
  description: "",
  descriptionAr: "",
  rating: 3,
};

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) {
      return data.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
};

const CoachDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const coachId = id as Id<"coaches"> | undefined;

  const coach = useQuery(
    api.coach.getCoachById,
    coachId ? { id: coachId } : "skip"
  );
  const updateCoach = useMutation(api.coach.updateCoach);
  const deleteCoach = useMutation(api.coach.deleteCoach);
  const generateImageUploadUrl = useMutation(api.coach.generateImageUploadUrl);
  const updateCoachImage = useMutation(api.coach.updateCoachImage);
  const generateThumbnail = useAction(api.image.generateThumbnail);
  const convertToJpeg = useAction(api.image.convertToJpeg);

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [imageUploadState, setImageUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const tempObjectUrlRef = useRef<string | null>(null);

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    watch,
  } = useForm<CoachInput>({
    resolver: zodResolver(coachInputSchema),
    defaultValues,
  });

  useEffect(() => {
    if (coach) {
      reset({
        name: coach.name,
        nameAr: coach.name_ar,
        expertise: coach.expertise,
        expertiseAr: coach.expertise_ar,
        description: coach.description,
        descriptionAr: coach.description_ar,
        rating: coach.rating,
      });
      if (!tempObjectUrlRef.current) {
        setImagePreviewUrl(coach.profile_image_url ?? null);
        setThumbnailPreviewUrl(coach.profile_thumbnail_url ?? null);
      }
    }
  }, [coach, reset]);

  useEffect(() => {
    return () => {
      if (tempObjectUrlRef.current) {
        URL.revokeObjectURL(tempObjectUrlRef.current);
      }
    };
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    if (!coachId || !coach) {
      toast.error("Coach record is not available.");
      return;
    }

    try {
      await updateCoach({
        id: coachId,
        name: values.name,
        nameAr: values.nameAr,
        expertise: values.expertise,
        expertiseAr: values.expertiseAr,
        description: values.description,
        descriptionAr: values.descriptionAr,
        rating: values.rating,
      });

      toast.success("Coach profile updated.");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    }
  });

  const handleDeleteCoach = async () => {
    if (!coachId) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteCoach({ id: coachId });
      toast.success("Coach deleted successfully");
      navigate("/coaches");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const isLoading = coach === undefined;

  const watchName = watch("name");
  const watchExpertise = watch("expertise");
  const watchDescription = watch("description");
  const watchRating = watch("rating");
  const watchArabicName = watch("nameAr");
  const watchArabicExpertise = watch("expertiseAr");
  const watchArabicDescription = watch("descriptionAr");

  const ratingValue = Number.isFinite(watchRating) ? watchRating : 0;
  const wholeStars = Math.floor(Math.max(0, Math.min(ratingValue, 5)));
  const avatarFallback = (watchName || "C").slice(0, 2).toUpperCase();
  const ratingStars = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => (
        <Star
          key={`rating-star-${index}`}
          className={`h-4 w-4 ${
            index < wholeStars ? "text-yellow-400 fill-yellow-300" : "text-muted-foreground/30"
          }`}
        />
      )),
    [wholeStars]
  );

  const uploadFileWithProgress = (
    uploadUrl: string,
    file: File,
    onProgress: (progress: number) => void
  ) =>
    new Promise<{ storageId: string }>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.responseType = "json";
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        onProgress(0);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const progress = Math.min(1, event.loaded / event.total);
            onProgress(progress);
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error while uploading the image."));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response =
                xhr.response && typeof xhr.response === "object"
                  ? xhr.response
                  : JSON.parse(xhr.responseText);

              if (response && typeof response.storageId === "string") {
                onProgress(1);
                resolve({ storageId: response.storageId });
                return;
              }

              reject(new Error("Upload completed but no storage ID was returned."));
            } catch (parseError) {
              reject(
                parseError instanceof Error
                  ? parseError
                  : new Error("Failed to parse upload response.")
              );
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}.`));
          }
        };

        xhr.send(file);
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error("Unexpected error while preparing the upload.")
        );
      }
    });

  const resetTempPreview = () => {
    if (tempObjectUrlRef.current) {
      URL.revokeObjectURL(tempObjectUrlRef.current);
      tempObjectUrlRef.current = null;
    }
  };

  const startPhotoUpload = async (file: File) => {
    if (!coachId || !coach) {
      toast.error("Coach record is not available.");
      return;
    }

    setImageUploadState({
      status: "uploading",
      progress: 0,
    });

    try {
      const uploadUrl = await generateImageUploadUrl();
      const { storageId } = await uploadFileWithProgress(uploadUrl, file, (progress) => {
        setImageUploadState({
          status: "uploading",
          progress: progress * 0.6,
        });
      });

      setImageUploadState({
        status: "uploading",
        progress: 0.75,
      });

      const originalStorageId = storageId as Id<"_storage">;
      const convertedStorageId = await convertToJpeg({
        storageId: originalStorageId,
        quality: 90,
        cropToSquare: true,
      });

      setImageUploadState({
        status: "uploading",
        progress: 0.9,
      });

      const thumbnailStorageId = await generateThumbnail({
        storageId: convertedStorageId,
        maxWidth: 320,
        maxHeight: 320,
        quality: 90,
      });

      const result = await updateCoachImage({
        id: coachId,
        profileImageStorageId: convertedStorageId,
        profileThumbnailStorageId: thumbnailStorageId,
      });

      resetTempPreview();
      setImagePreviewUrl(result.profileImageUrl);
      setThumbnailPreviewUrl(result.profileThumbnailUrl ?? result.profileImageUrl);

      setImageUploadState({
        status: "success",
        progress: 1,
      });

      toast.success("Profile photo updated.");

      setTimeout(() => {
        setImageUploadState({
          status: "idle",
          progress: 0,
        });
      }, 1200);
    } catch (error) {
      console.error(error);
      resetTempPreview();
      setImagePreviewUrl(coach?.profile_image_url ?? null);
      setThumbnailPreviewUrl(coach?.profile_thumbnail_url ?? coach?.profile_image_url ?? null);
      setImageUploadState({
        status: "error",
        progress: 0,
        errorMessage: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error));
    }
  };

  const handlePhotoSelect = (file: File) => {
    if (!coachId || !coach) {
      toast.error("Coach record is not available.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a valid image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please choose an image smaller than 5MB.");
      return;
    }

    resetTempPreview();
    const objectUrl = URL.createObjectURL(file);
    tempObjectUrlRef.current = objectUrl;
    setImagePreviewUrl(objectUrl);
    setThumbnailPreviewUrl(null);
    startPhotoUpload(file);
  };

  if (!coachId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Invalid coach identifier.</p>
      </div>
    );
  }

  if (coach === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading coach…</p>
      </div>
    );
  }

  if (coach === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-lg font-medium">Coach not found</p>
          <p className="text-sm text-muted-foreground">
            The coach you&apos;re looking for does not exist or was removed.
          </p>
          <Button variant="cta" onClick={() => navigate("/coaches")}>
            Back to coaches
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/coaches")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Coach Details</h1>
            <p className="text-muted-foreground mt-1">
              Update the coach profile and settings.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          {coach.course_count} courses
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile details</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name (EN)</Label>
                  <Input
                    id="name"
                    disabled={isLoading}
                    {...register("name")}
                    placeholder="Coach name"
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameAr">Name (AR)</Label>
                  <Input
                    id="nameAr"
                    dir="rtl"
                    className="text-right"
                    disabled={isLoading}
                    {...register("nameAr")}
                    placeholder="اسم المدرب"
                  />
                  {errors.nameAr && (
                    <p className="text-sm text-destructive">{errors.nameAr.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expertise">Expertise (EN)</Label>
                  <Input
                    id="expertise"
                    disabled={isLoading}
                    {...register("expertise")}
                    placeholder="Confidence & Life Coach"
                  />
                  {errors.expertise && (
                    <p className="text-sm text-destructive">{errors.expertise.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expertiseAr">Expertise (AR)</Label>
                  <Input
                    id="expertiseAr"
                    dir="rtl"
                    className="text-right"
                    disabled={isLoading}
                    {...register("expertiseAr")}
                    placeholder="مدربة ثقة وحياة"
                  />
                  {errors.expertiseAr && (
                    <p className="text-sm text-destructive">{errors.expertiseAr.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="description">Description (EN)</Label>
                  <Textarea
                    id="description"
                    rows={5}
                    disabled={isLoading}
                    {...register("description")}
                    placeholder="Share a short overview of the coach."
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive">{errors.description.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descriptionAr">Description (AR)</Label>
                  <Textarea
                    id="descriptionAr"
                    rows={5}
                    dir="rtl"
                    className="text-right"
                    disabled={isLoading}
                    {...register("descriptionAr")}
                    placeholder="نبذة تعريفية باللغة العربية."
                  />
                  {errors.descriptionAr && (
                    <p className="text-sm text-destructive">{errors.descriptionAr.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rating">Review rating</Label>
                <Input
                  id="rating"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  disabled={isLoading}
                  {...register("rating", { valueAsNumber: true })}
                />
                {errors.rating && (
                  <p className="text-sm text-destructive">{errors.rating.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete coach
                </Button>
                <Button
                  type="submit"
                  variant="cta"
                  disabled={isLoading || isSubmitting || !isDirty}
                >
                  {isSubmitting ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ImageDropzone
            id="coach-photo"
            label="Coach photo"
            helperText="Square image recommended (min 800×800). Click to browse or drop a file."
            aspectRatioClass="aspect-square"
            value={imagePreviewUrl}
            onSelectFile={handlePhotoSelect}
            uploadState={imageUploadState}
            disabled={isLoading}
          />
          <Card className="shadow-lg border-primary/10">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={imagePreviewUrl ?? undefined} alt={watchName} />
                  <AvatarFallback>{avatarFallback}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {watchName || "Coach name"}
                  </h3>
                  <p className="text-primary text-sm font-medium">
                    {watchExpertise || "Expertise"}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">{ratingStars}</div>
                    <span>{ratingValue.toFixed(1)}</span>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                {watchDescription || "Write a compelling description."}
              </p>
              {thumbnailPreviewUrl && (
                <div className="rounded-2xl border border-border/50 bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Generated thumbnail
                  </p>
                  <img
                    src={thumbnailPreviewUrl}
                    alt="Coach thumbnail preview"
                    className="h-28 w-28 rounded-2xl object-cover"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed border-primary/20">
            <CardHeader>
              <CardTitle className="text-base">Arabic snapshot</CardTitle>
            </CardHeader>
            <CardContent className="text-right space-y-2 text-muted-foreground" dir="rtl">
              <p className="font-semibold text-foreground">{watchArabicName || "اسم المدربة"}</p>
              <p className="text-sm text-primary">{watchArabicExpertise || "التخصص"}</p>
              <p>{watchArabicDescription || "اكتب نبذة تعريفية باللغة العربية هنا."}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coach?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">{coach.name}</span> and all associated
              data. You can&apos;t undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCoach}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CoachDetail;
