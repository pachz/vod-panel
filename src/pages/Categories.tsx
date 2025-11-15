import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { DataTable, type TableColumn, type TableAction, getPreviewText } from "@/components/DataTable";
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
import { categoryInputSchema } from "../../shared/validation/category";

type CategoryDoc = Doc<"categories">;

type FormValues = {
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
};

const Categories = () => {
  const categories = useQuery(api.category.listCategories);
  const createCategory = useMutation(api.category.createCategory);
  const updateCategory = useMutation(api.category.updateCategory);
  const deleteCategory = useMutation(api.category.deleteCategory);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDoc | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>({
    name: "",
    nameAr: "",
    description: "",
    descriptionAr: "",
  });
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionArRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustTextareaHeight = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) {
      return;
    }

    const minHeight = 3 * 24; // ~3 lines at 24px line height
    element.style.minHeight = `${minHeight}px`;
    element.style.height = "auto";

    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : undefined;
    const reservedSpace = 420; // headers, other fields, actions, and padding
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

    if (editingCategory) {
      setFormValues({
        name: editingCategory.name,
        nameAr: editingCategory.name_ar ?? "",
        description: editingCategory.description ?? "",
        descriptionAr: editingCategory.description_ar ?? "",
      });
    } else {
      setFormValues({
        name: "",
        nameAr: "",
        description: "",
        descriptionAr: "",
      });
    }

    requestAnimationFrame(() => {
      adjustTextareaHeight(descriptionRef.current);
      adjustTextareaHeight(descriptionArRef.current);
    });
  }, [adjustTextareaHeight, editingCategory, isDialogOpen]);

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

  const categoryList = useMemo<CategoryDoc[]>(() => categories ?? [], [categories]);
  const isLoading = categories === undefined;
  const categoryName = categoryToDelete?.name ?? "this category";

  const columns = useMemo<TableColumn<CategoryDoc>[]>(
    () => [
      {
        header: "Name",
        render: (category) => (
          <span className="font-medium">{category.name}</span>
        ),
        cellClassName: "font-medium",
      },
      {
        header: "Description",
        render: (category) => (
          <span className="text-muted-foreground">
            {getPreviewText(category.description)}
          </span>
        ),
        cellClassName: "text-muted-foreground",
      },
      {
        header: "Courses",
        render: (category) => `${category.course_count} courses`,
      },
    ],
    []
  );

  const actions = useMemo<TableAction<CategoryDoc>[]>(
    () => [
      {
        icon: Pencil,
        label: "Edit category",
        onClick: (category) => {
          setEditingCategory(category);
          setIsDialogOpen(true);
        },
      },
      {
        icon: Trash2,
        label: "Delete category",
        onClick: setCategoryToDelete,
        className: "text-destructive",
      },
    ],
    []
  );

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

    const validation = categoryInputSchema.safeParse(formValues);

    if (!validation.success) {
      const issue = validation.error.errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    const { name, nameAr, description, descriptionAr } = validation.data;

    setIsSaving(true);

    try {
      if (editingCategory) {
        await updateCategory({
          id: editingCategory._id,
          name,
          description,
          nameAr,
          descriptionAr,
        });
        toast.success("Category updated successfully");
      } else {
        await createCategory({
          name,
          description,
          nameAr,
          descriptionAr,
        });
        toast.success("Category created successfully");
      }

      setIsDialogOpen(false);
      setEditingCategory(null);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteCategory({ id: categoryToDelete._id });
      toast.success("Category deleted successfully");
      setCategoryToDelete(null);
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
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-2">
            Organize your courses into categories
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingCategory(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="cta"
              onClick={() => {
                setEditingCategory(null);
                setIsDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Edit" : "Create"} Category</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formValues.name}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
                  required
                  maxLength={24}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameAr">Arabic Name</Label>
                <Input
                  id="nameAr"
                  name="nameAr"
                  value={formValues.nameAr}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, nameAr: event.target.value }))}
                  required
                  maxLength={24}
                  dir="rtl"
                  className="text-right"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formValues.description}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, description: event.target.value }))
                  }
                  onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                  ref={descriptionRef}
                  required
                  maxLength={1024}
                  rows={3}
                  className="min-h-[6.75rem] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descriptionAr">Arabic Description</Label>
                <Textarea
                  id="descriptionAr"
                  name="descriptionAr"
                  value={formValues.descriptionAr}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, descriptionAr: event.target.value }))
                  }
                  onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                  ref={descriptionArRef}
                  required
                  maxLength={1024}
                  dir="rtl"
                  rows={3}
                  className="min-h-[6.75rem] resize-none text-right"
                />
              </div>
              <Button type="submit" variant="cta" className="w-full" disabled={isSaving}>
                {isSaving ? "Saving…" : editingCategory ? "Update" : "Create"} Category
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={categoryList}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(category) => category._id}
        loadingMessage="Loading categories…"
        emptyMessage="No categories yet. Create your first category to get started."
      />

      <AlertDialog
        open={categoryToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">{categoryName}</span> for
              everyone. You can&apos;t undo this action.
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
    </div>
  );
};

export default Categories;
