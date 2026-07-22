import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Eye, Trash2, RotateCcw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { ViewDeletedToggle } from "@/components/ViewDeletedToggle";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { DataTable, type TableColumn, type TableAction } from "@/components/DataTable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { blogCategoryInputSchema } from "../../shared/validation/blogCategory";

type BlogCategoryDoc = Doc<"blogCategories">;

type FormValues = {
  name: string;
  nameAr: string;
  color: string;
};

const DEFAULT_COLOR = "#E91E8C";

const BlogCategories = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewDeleted = searchParams.get("deleted") === "true";

  const categories = useQuery(
    viewDeleted
      ? api.blogCategory.listDeletedBlogCategories
      : api.blogCategory.listBlogCategories,
  );
  const createCategory = useMutation(api.blogCategory.createBlogCategory);
  const updateCategory = useMutation(api.blogCategory.updateBlogCategory);
  const deleteCategory = useMutation(api.blogCategory.deleteBlogCategory);
  const restoreCategory = useMutation(api.blogCategory.restoreBlogCategory);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BlogCategoryDoc | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<BlogCategoryDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categoryToRestore, setCategoryToRestore] = useState<BlogCategoryDoc | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>({
    name: "",
    nameAr: "",
    color: DEFAULT_COLOR,
  });

  useEffect(() => {
    if (!isDialogOpen) return;

    if (editingCategory) {
      setFormValues({
        name: editingCategory.name,
        nameAr: editingCategory.name_ar,
        color: editingCategory.color || DEFAULT_COLOR,
      });
    } else {
      setFormValues({
        name: "",
        nameAr: "",
        color: DEFAULT_COLOR,
      });
    }
  }, [editingCategory, isDialogOpen]);

  const categoryList = useMemo(() => categories ?? [], [categories]);
  const isLoading = categories === undefined;

  const columns = useMemo<TableColumn<BlogCategoryDoc>[]>(
    () => [
      {
        header: "Name",
        render: (category) => (
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{
                color: category.color,
                borderColor: `${category.color}55`,
                backgroundColor: `${category.color}14`,
              }}
            >
              {category.name}
            </span>
            <span className="text-xs text-muted-foreground">{category.name_ar}</span>
          </div>
        ),
      },
      {
        header: "Color",
        render: (category) => (
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: category.color }}
            />
            <span className="font-mono text-xs text-muted-foreground">{category.color}</span>
          </div>
        ),
      },
      {
        header: "Blogs",
        render: (category) => `${category.blog_count} blogs`,
      },
    ],
    [],
  );

  const actions = useMemo<TableAction<BlogCategoryDoc>[]>(
    () =>
      viewDeleted
        ? [
            {
              icon: RotateCcw,
              label: "Restore category",
              onClick: setCategoryToRestore,
              className: "text-primary",
            },
          ]
        : [
            {
              icon: Eye,
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
    [viewDeleted],
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
      if (data?.message) return data.message;
    }
    if (error instanceof Error && error.message) return error.message;
    return "Something went wrong. Please try again.";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = blogCategoryInputSchema.safeParse(formValues);
    if (!validation.success) {
      toast.error(validation.error.errors[0]?.message ?? "Please check the form.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingCategory) {
        await updateCategory({
          id: editingCategory._id,
          ...validation.data,
        });
        toast.success("Blog category updated.");
      } else {
        await createCategory(validation.data);
        toast.success("Blog category created.");
      }
      setIsDialogOpen(false);
      setEditingCategory(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCategory({ id: categoryToDelete._id });
      toast.success("Blog category deleted.");
      setCategoryToDelete(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!categoryToRestore) return;
    setIsRestoring(true);
    try {
      await restoreCategory({ id: categoryToRestore._id });
      toast.success("Blog category restored.");
      setCategoryToRestore(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {viewDeleted ? "Deleted Blog Categories" : "Blog Categories"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {viewDeleted
              ? "View and restore deleted blog categories"
              : "Organize blogs into colored categories"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewDeletedToggle
            viewDeleted={viewDeleted}
            onToggle={toggleViewDeleted}
            activeLabel="View Active Categories"
            deletedLabel="View Deleted"
          />
          {!viewDeleted && (
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) setEditingCategory(null);
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
                  <DialogTitle>
                    {editingCategory ? "Edit" : "Create"} Blog Category
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Title (EN)</Label>
                    <Input
                      id="name"
                      value={formValues.name}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, name: e.target.value }))
                      }
                      maxLength={40}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameAr">Title (AR)</Label>
                    <Input
                      id="nameAr"
                      value={formValues.nameAr}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, nameAr: e.target.value }))
                      }
                      maxLength={40}
                      dir="rtl"
                      className="text-right"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={formValues.color}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, color: e.target.value }))
                        }
                        className="h-10 w-12 p-1"
                      />
                      <Input
                        value={formValues.color}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, color: e.target.value }))
                        }
                        placeholder="#E91E8C"
                        className="font-mono"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Category name will render in a pill using this color.
                    </p>
                  </div>
                  <Button type="submit" variant="cta" className="w-full" disabled={isSaving}>
                    {isSaving ? "Saving…" : editingCategory ? "Update" : "Create"} Category
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <DataTable
        data={categoryList}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(category) => category._id}
        loadingMessage="Loading blog categories…"
        emptyMessage={
          viewDeleted
            ? "No deleted blog categories."
            : "No blog categories yet. Create your first category to get started."
        }
      />

      <AlertDialog
        open={categoryToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setCategoryToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blog category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {categoryToDelete?.name ?? "this category"}
              </span>
              . Categories with blogs cannot be deleted.
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
        open={categoryToRestore !== null}
        onOpenChange={(open) => {
          if (!open) setCategoryToRestore(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore blog category?</AlertDialogTitle>
            <AlertDialogDescription>
              Restore{" "}
              <span className="font-medium text-foreground">
                {categoryToRestore?.name ?? "this category"}
              </span>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BlogCategories;
