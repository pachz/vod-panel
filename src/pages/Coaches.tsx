import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Eye, Trash2, RotateCcw, Star } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { ViewDeletedToggle } from "@/components/ViewDeletedToggle";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type TableColumn,
  type TableAction,
  getPreviewText,
} from "@/components/DataTable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { coachCreateSchema } from "../../shared/validation/coach";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type CoachDoc = Doc<"coaches">;

type FormValues = {
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
};

const initialFormValues: FormValues = {
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
};

const Coaches = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewDeleted = searchParams.get("deleted") === "true";

  const coaches = useQuery(
    viewDeleted ? api.coach.listDeletedCoaches : api.coach.listCoaches
  );
  const createCoach = useMutation(api.coach.createCoach);
  const deleteCoach = useMutation(api.coach.deleteCoach);
  const restoreCoach = useMutation(api.coach.restoreCoach);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [coachToDelete, setCoachToDelete] = useState<CoachDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [coachToRestore, setCoachToRestore] = useState<CoachDoc | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);

  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionArRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustTextareaHeight = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) {
      return;
    }

    const minHeight = 3 * 24;
    element.style.minHeight = `${minHeight}px`;
    element.style.height = "auto";

    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : undefined;
    const reservedSpace = 420;
    const availableSpace = viewportHeight
      ? Math.max(viewportHeight - reservedSpace, minHeight)
      : undefined;
    const maxHeight = availableSpace ? Math.max(minHeight, availableSpace / 2) : undefined;

    const desiredHeight = element.scrollHeight;

    if (maxHeight) {
      const nextHeight = Math.min(desiredHeight, maxHeight);
      element.style.height = `${nextHeight}px`;
      element.style.maxHeight = `${maxHeight}px`;
      element.style.overflowY = desiredHeight > maxHeight ? "auto" : "hidden";
    } else {
      element.style.height = `${desiredHeight}px`;
      element.style.overflowY = "hidden";
    }
  }, []);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    setFormValues(initialFormValues);

    requestAnimationFrame(() => {
      adjustTextareaHeight(descriptionRef.current);
      adjustTextareaHeight(descriptionArRef.current);
    });
  }, [adjustTextareaHeight, isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    adjustTextareaHeight(descriptionRef.current);
  }, [adjustTextareaHeight, formValues.description, isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    adjustTextareaHeight(descriptionArRef.current);
  }, [adjustTextareaHeight, formValues.descriptionAr, isDialogOpen]);

  const coachList = useMemo<CoachDoc[]>(() => coaches ?? [], [coaches]);
  const isLoading = coaches === undefined;

  const columns = useMemo<TableColumn<CoachDoc>[]>(
    () => [
      {
        header: "Photo",
        headerClassName: "w-[80px]",
        render: (coach) => (
          <Avatar className="h-12 w-12">
            <AvatarImage src={coach.profile_image_url ?? undefined} alt={coach.name} />
            <AvatarFallback>
              {(coach.name || "C").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ),
      },
      {
        header: "Name",
        render: (coach) => (
          <div>
            <span className="font-medium">{coach.name}</span>
            <p className="text-xs text-muted-foreground">{coach.expertise}</p>
          </div>
        ),
      },
      {
        header: "Description",
        render: (coach) => (
          <span className="text-muted-foreground">
            {getPreviewText(coach.description)}
          </span>
        ),
        cellClassName: "text-muted-foreground",
      },
      {
        header: "Rating",
        render: (coach) => (
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-300" />
            <span className="text-sm">{coach.rating.toFixed(1)}</span>
          </div>
        ),
      },
      {
        header: "Courses",
        render: (coach) => `${coach.course_count} courses`,
      },
    ],
    []
  );

  const actions = useMemo<TableAction<CoachDoc>[]>(
    () =>
      viewDeleted
        ? [
            {
              icon: RotateCcw,
              label: "Restore coach",
              onClick: setCoachToRestore,
              className: "text-primary",
            },
          ]
        : [
            {
              icon: Eye,
              label: "View coach",
              onClick: (coach) => navigate(`/coaches/${coach._id}`),
            },
            {
              icon: Trash2,
              label: "Delete coach",
              onClick: setCoachToDelete,
              className: "text-destructive",
            },
          ],
    [navigate, viewDeleted]
  );

  const toggleViewDeleted = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    if (viewDeleted) {
      newParams.delete("deleted");
    } else {
      newParams.set("deleted", "true");
    }
    setSearchParams(newParams, { replace: true });
  }, [viewDeleted, searchParams, setSearchParams]);

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = coachCreateSchema.safeParse(formValues);

    if (!validation.success) {
      const requiredFieldPaths = ["name", "nameAr", "description", "descriptionAr"];
      const errors = validation.error.errors;

      const requiredFieldError = errors.find(
        (err) => err.path && requiredFieldPaths.includes(String(err.path[0]))
      );

      const issue = requiredFieldError ?? errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    const { name, nameAr, description, descriptionAr } = validation.data;

    setIsSaving(true);

    try {
      const coachId = await createCoach({
        name,
        nameAr,
        description,
        descriptionAr,
      });

      toast.success("Coach created successfully");
      setIsDialogOpen(false);
      setFormValues(initialFormValues);
      navigate(`/coaches/${coachId}`);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!coachToDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteCoach({ id: coachToDelete._id });
      toast.success("Coach deleted successfully");
      setCoachToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {viewDeleted ? "Deleted Coaches" : "Coaches"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {viewDeleted
              ? "View and restore deleted coaches"
              : "Manage your coaching team"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewDeletedToggle
            viewDeleted={viewDeleted}
            onToggle={toggleViewDeleted}
            activeLabel="View Active Coaches"
            deletedLabel="View Deleted"
          />
          {!viewDeleted && (
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setFormValues(initialFormValues);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="cta"
                  onClick={() => {
                    setFormValues(initialFormValues);
                    setIsDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Coach
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Coach</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name (EN)</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formValues.name}
                        onChange={(event) =>
                          setFormValues((prev) => ({ ...prev, name: event.target.value }))
                        }
                        maxLength={64}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nameAr">Name (AR)</Label>
                      <Input
                        id="nameAr"
                        name="nameAr"
                        value={formValues.nameAr}
                        onChange={(event) =>
                          setFormValues((prev) => ({ ...prev, nameAr: event.target.value }))
                        }
                        maxLength={64}
                        dir="rtl"
                        className="text-right"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="description">Description (EN)</Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={formValues.description}
                        onChange={(event) =>
                          setFormValues((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                        onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                        ref={descriptionRef}
                        maxLength={1024}
                        rows={3}
                        className="min-h-[6.75rem] resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="descriptionAr">Description (AR)</Label>
                      <Textarea
                        id="descriptionAr"
                        name="descriptionAr"
                        value={formValues.descriptionAr}
                        onChange={(event) =>
                          setFormValues((prev) => ({
                            ...prev,
                            descriptionAr: event.target.value,
                          }))
                        }
                        onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                        ref={descriptionArRef}
                        maxLength={1024}
                        dir="rtl"
                        rows={3}
                        className="min-h-[6.75rem] resize-none text-right"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default expertise: General Coach. Default rating: 3.0
                  </p>
                  <Button type="submit" variant="cta" className="w-full" disabled={isSaving}>
                    {isSaving ? "Creating…" : "Create Coach"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <DataTable
        data={coachList}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(coach) => coach._id}
        loadingMessage="Loading coaches…"
        emptyMessage={
          viewDeleted
            ? "No deleted coaches."
            : "No coaches yet. Create your first coach to get started."
        }
      />

      <AlertDialog
        open={coachToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCoachToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coach?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {coachToDelete?.name ?? "this coach"}
              </span>{" "}
              for everyone. You can&apos;t undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={coachToRestore !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCoachToRestore(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore coach?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore{" "}
              <span className="font-medium text-foreground">
                {coachToRestore?.name ?? "this coach"}
              </span>
              ? The coach will be available again in the coaches list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestoring}
              onClick={async () => {
                if (!coachToRestore) {
                  return;
                }
                setIsRestoring(true);

                try {
                  await restoreCoach({ id: coachToRestore._id });
                  toast.success("Coach restored successfully");
                  setCoachToRestore(null);
                } catch (error) {
                  console.error(error);
                  toast.error(getErrorMessage(error));
                } finally {
                  setIsRestoring(false);
                }
              }}
            >
              {isRestoring ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Coaches;
