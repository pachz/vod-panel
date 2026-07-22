import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type TableColumn,
  type TableAction,
} from "@/components/DataTable";
import { type TableFilter } from "@/components/TableFilters";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { blogCreateSchema } from "../../shared/validation/blog";

type BlogListItem = {
  _id: Id<"blogs">;
  _creationTime: number;
  title: string;
  title_ar: string;
  status: "draft" | "published";
  category_id: Id<"blogCategories">;
  categoryName: string;
  categoryNameAr: string;
  categoryColor: string;
  author_id: Id<"coaches">;
  authorName: string;
  reading_time_minutes: number;
  thumbnail_image_url?: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  hasPublishedSnapshot: boolean;
  hasUnpublishedChanges: boolean;
};

const statusLabels: Record<BlogListItem["status"], string> = {
  draft: "Draft",
  published: "Published",
};

const statusVariants: Record<BlogListItem["status"], "secondary" | "default"> = {
  draft: "secondary",
  published: "default",
};

const Blogs = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || undefined;
  const categoryFilter = searchParams.get("category") || undefined;
  const searchFilter = searchParams.get("search") || undefined;

  const PAGE_SIZE = 12;
  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginatedBlogs, setPaginatedBlogs] = useState<BlogListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [cursorScope, setCursorScope] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [blogToDelete, setBlogToDelete] = useState<BlogListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = useQuery(api.blogCategory.listBlogCategories);
  const coaches = useQuery(api.coach.listCoaches);

  const filterKey = useMemo(
    () => `${statusFilter ?? ""}|${categoryFilter ?? ""}|${searchFilter ?? ""}`,
    [statusFilter, categoryFilter, searchFilter],
  );

  const blogsPage = useQuery(api.blog.listBlogs, {
    status: statusFilter as BlogListItem["status"] | undefined,
    categoryId: categoryFilter as Id<"blogCategories"> | undefined,
    search: searchFilter,
    limit: PAGE_SIZE,
    cursor: cursor !== null && cursorScope === filterKey ? cursor : undefined,
  });

  const createBlog = useMutation(api.blog.createBlog);
  const deleteBlog = useMutation(api.blog.deleteBlog);

  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  useEffect(() => {
    setCursor(null);
    setContinueCursor(null);
    setIsDone(false);
    setPaginatedBlogs([]);
    setCursorScope(null);
  }, [filterKey]);

  useEffect(() => {
    if (!blogsPage) return;

    setContinueCursor(blogsPage.continueCursor);
    setIsDone(blogsPage.isDone);
    setCursorScope(filterKey);

    setPaginatedBlogs((prev) => {
      if (cursor === null || cursorScope !== filterKey) {
        return blogsPage.page;
      }
      const existingIds = new Set(prev.map((b) => b._id));
      const newItems = blogsPage.page.filter((b) => !existingIds.has(b._id));
      return [...prev, ...newItems];
    });
    setIsLoadingMore(false);
  }, [blogsPage, cursor, cursorScope, filterKey]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams);
        if (value.trim()) params.set("search", value.trim());
        else params.delete("search");
        setSearchParams(params, { replace: true });
      }, 300);
    },
    [searchParams, setSearchParams],
  );

  const handleStatusFilterChange = useCallback(
    (value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) params.set("status", value);
      else params.delete("status");
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleCategoryFilterChange = useCallback(
    (value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) params.set("category", value);
      else params.delete("category");
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleClearAllFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
    setSearchInput("");
  }, [setSearchParams]);

  const handleLoadMore = () => {
    if (continueCursor && !isDone && !isLoadingMore) {
      setIsLoadingMore(true);
      setCursor(continueCursor);
    }
  };

  const resetCreateForm = () => {
    setTitle("");
    setTitleAr("");
    setCategoryId("");
    setAuthorId("");
  };

  const handleCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    const result = blogCreateSchema.safeParse({
      title,
      titleAr,
      categoryId,
      authorId,
    });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSaving(true);
    try {
      const blogId = await createBlog({
        title: result.data.title,
        titleAr: result.data.titleAr,
        categoryId: result.data.categoryId as Id<"blogCategories">,
        authorId: result.data.authorId as Id<"coaches">,
      });
      toast.success("Blog created.");
      setIsDialogOpen(false);
      resetCreateForm();
      navigate(`/blogs/${blogId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create blog.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!blogToDelete) return;
    setIsDeleting(true);
    try {
      await deleteBlog({ blogId: blogToDelete._id });
      toast.success("Blog deleted.");
      setBlogToDelete(null);
      setPaginatedBlogs((prev) => prev.filter((b) => b._id !== blogToDelete._id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete blog.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filters = useMemo<TableFilter[]>(
    () => [
      {
        id: "status",
        label: "Status",
        value: statusFilter,
        placeholder: "All statuses",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Published", value: "published" },
        ],
        onChange: handleStatusFilterChange,
      },
      {
        id: "category",
        label: "Category",
        value: categoryFilter,
        placeholder: "All categories",
        options: (categories ?? []).map((c) => ({
          label: c.name,
          value: c._id,
        })),
        onChange: handleCategoryFilterChange,
      },
    ],
    [statusFilter, categoryFilter, categories, handleStatusFilterChange, handleCategoryFilterChange],
  );

  const columns = useMemo<TableColumn<BlogListItem>[]>(
    () => [
      {
        header: "Title",
        render: (blog) => (
          <div className="flex items-center gap-3">
            {blog.thumbnail_image_url ? (
              <img
                src={blog.thumbnail_image_url}
                alt=""
                className="h-10 w-14 rounded object-cover"
              />
            ) : (
              <div className="h-10 w-14 rounded bg-muted" />
            )}
            <div>
              <span className="font-medium">{blog.title}</span>
              <span className="block text-xs text-muted-foreground">{blog.title_ar}</span>
            </div>
          </div>
        ),
      },
      {
        header: "Category",
        render: (blog) => (
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              color: blog.categoryColor,
              borderColor: `${blog.categoryColor}55`,
              backgroundColor: `${blog.categoryColor}14`,
            }}
          >
            {blog.categoryName}
          </span>
        ),
      },
      {
        header: "Author",
        render: (blog) => blog.authorName,
      },
      {
        header: "Read time",
        render: (blog) => `${blog.reading_time_minutes} min`,
      },
      {
        header: "Status",
        render: (blog) => (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={statusVariants[blog.status]} className="w-fit">
              {statusLabels[blog.status]}
            </Badge>
            {blog.hasUnpublishedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unpublished changes
              </span>
            )}
          </div>
        ),
      },
      {
        header: "Updated",
        render: (blog) => format(new Date(blog.updatedAt), "PP"),
        cellClassName: "text-muted-foreground",
      },
    ],
    [],
  );

  const actions = useMemo<TableAction<BlogListItem>[]>(
    () => [
      {
        icon: Eye,
        label: "View blog",
        onClick: (blog) => navigate(`/blogs/${blog._id}`),
      },
      {
        icon: Pencil,
        label: "Edit blog",
        onClick: (blog) => navigate(`/blogs/${blog._id}`),
      },
      {
        icon: Trash2,
        label: "Delete blog",
        onClick: setBlogToDelete,
        className: "text-destructive",
      },
    ],
    [navigate],
  );

  const isLoading = blogsPage === undefined && paginatedBlogs.length === 0;
  const canCreate =
    (categories?.length ?? 0) > 0 && (coaches?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blogs</h1>
          <p className="text-sm text-muted-foreground">
            Create and publish bilingual blog articles.
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetCreateForm();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="cta" disabled={!canCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create blog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create blog</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="blog-title">Title (EN)</Label>
                <Input
                  id="blog-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Blog title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-title-ar">Title (AR)</Label>
                <Input
                  id="blog-title-ar"
                  value={titleAr}
                  dir="rtl"
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="عنوان المدونة"
                />
              </div>
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
              {!canCreate && (
                <p className="text-sm text-muted-foreground">
                  Add at least one blog category and one coach before creating a blog.
                </p>
              )}
              <Button type="submit" variant="cta" className="w-full" disabled={isSaving || !canCreate}>
                {isSaving ? "Creating…" : "Create blog"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={paginatedBlogs}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(blog) => blog._id}
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search blogs…"
        filters={filters}
        onClearAllFilters={handleClearAllFilters}
        loadingMessage="Loading blogs…"
        emptyMessage="No blogs yet. Create your first blog to get started."
      />

      {!isDone && paginatedBlogs.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      <AlertDialog
        open={blogToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setBlogToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blog?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {blogToDelete?.title ?? "this blog"}
              </span>
              .
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

export default Blogs;
