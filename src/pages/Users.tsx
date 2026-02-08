import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Lock, Eye, Download, Gift, Search, Loader2 } from "lucide-react";
import { useMutation, useQuery, useAction } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { userInputSchema, userUpdateSchema, userPasswordUpdateSchema } from "../../shared/validation/user";

type UserDoc = Doc<"users">;

type FormValues = {
  name: string;
  email: string;
  phone: string;
  password: string;
  isAdmin: boolean;
};

type PasswordFormValues = {
  password: string;
};

const initialFormValues: FormValues = {
  name: "",
  email: "",
  phone: "",
  password: "",
  isAdmin: false,
};

const PAGE_SIZE = 10;

const Users = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [paginatedRegularUsers, setPaginatedRegularUsers] = useState<UserDoc[]>([]);
  const [paginatedAdminUsers, setPaginatedAdminUsers] = useState<UserDoc[]>([]);
  const [regularCursor, setRegularCursor] = useState<string | null>(null);
  const [regularContinueCursor, setRegularContinueCursor] = useState<string | null>(null);
  const [regularIsDone, setRegularIsDone] = useState(false);
  const [regularLoadingMore, setRegularLoadingMore] = useState(false);
  const [regularCursorScope, setRegularCursorScope] = useState<string | null>(null);
  const [adminCursor, setAdminCursor] = useState<string | null>(null);
  const [adminContinueCursor, setAdminContinueCursor] = useState<string | null>(null);
  const [adminIsDone, setAdminIsDone] = useState(false);
  const [adminLoadingMore, setAdminLoadingMore] = useState(false);
  const [adminCursorScope, setAdminCursorScope] = useState<string | null>(null);

  const regularUsersPage = useQuery(
    api.user.listUsersPaginated,
    !searchTerm.trim()
      ? {
          numItems: PAGE_SIZE,
          isGod: false,
          cursor: regularCursor !== null && regularCursorScope === "list" ? regularCursor : undefined,
        }
      : "skip"
  );
  const adminUsersPage = useQuery(
    api.user.listUsersPaginated,
    !searchTerm.trim()
      ? {
          numItems: PAGE_SIZE,
          isGod: true,
          cursor: adminCursor !== null && adminCursorScope === "list" ? adminCursor : undefined,
        }
      : "skip"
  );
  const searchResults = useQuery(
    api.user.searchUsers,
    searchTerm.trim() ? { searchTerm: searchTerm.trim(), limit: 100 } : "skip"
  );
  const currentUser = useQuery(api.user.getCurrentUser);
  const createUser = useAction(api.user.createUser);
  const updateUser = useMutation(api.user.updateUser);
  const updateUserRole = useMutation(api.user.updateUserRole);
  const updateUserPassword = useAction(api.user.updateUserPassword);
  const deleteUser = useMutation(api.user.deleteUser);
  const exportUserEmails = useAction(api.user.exportUserEmails);
  const adminGrantSubscription = useMutation(api.user.adminGrantSubscription);

  const regularUsers = useMemo(
    () =>
      searchTerm.trim()
        ? (searchResults ?? []).filter((u) => !u.isGod)
        : paginatedRegularUsers,
    [searchTerm, searchResults, paginatedRegularUsers]
  );
  const adminUsers = useMemo(
    () =>
      searchTerm.trim()
        ? (searchResults ?? []).filter((u) => u.isGod)
        : paginatedAdminUsers,
    [searchTerm, searchResults, paginatedAdminUsers]
  );

  const regularUserIds = useMemo(
    () => regularUsers.map((u) => u._id),
    [regularUsers]
  );
  const subscriptionStatus = useQuery(
    api.user.getSubscriptionStatusForUsers,
    regularUserIds.length > 0 ? { userIds: regularUserIds } : "skip"
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDoc | null>(null);
  const [userToUpdatePassword, setUserToUpdatePassword] = useState<UserDoc | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [passwordFormValues, setPasswordFormValues] = useState<PasswordFormValues>({
    password: "",
  });
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    if (editingUser) {
      setFormValues({
        name: editingUser.name ?? "",
        email: editingUser.email ?? "",
        phone: editingUser.phone ?? "",
        password: "", // Don't populate password
        isAdmin: editingUser.isGod ?? false,
      });
    } else {
      setFormValues(initialFormValues);
    }
  }, [editingUser, isDialogOpen]);

  useEffect(() => {
    if (!isPasswordDialogOpen) {
      return;
    }

    setPasswordFormValues({ password: "" });
  }, [isPasswordDialogOpen]);

  // Reset pagination when search changes
  useEffect(() => {
    setPaginatedRegularUsers([]);
    setPaginatedAdminUsers([]);
    setRegularCursor(null);
    setRegularContinueCursor(null);
    setRegularIsDone(false);
    setRegularLoadingMore(false);
    setRegularCursorScope(null);
    setAdminCursor(null);
    setAdminContinueCursor(null);
    setAdminIsDone(false);
    setAdminLoadingMore(false);
    setAdminCursorScope(null);
  }, [searchTerm]);

  // Merge regular users paginated results
  useEffect(() => {
    if (!regularUsersPage || searchTerm.trim()) return;

    const { page, continueCursor: nextCursor, isDone: nextIsDone } = regularUsersPage;

    setPaginatedRegularUsers((prev) => {
      if (!regularCursor) return page as UserDoc[];
      const existingIds = new Set(prev.map((u) => u._id));
      const merged = [...prev];
      page.forEach((u) => {
        if (!existingIds.has(u._id)) merged.push(u as UserDoc);
      });
      return merged;
    });
    setRegularContinueCursor(nextCursor ?? null);
    setRegularIsDone(Boolean(nextIsDone) || !nextCursor);
    setRegularLoadingMore(false);
  }, [regularUsersPage, regularCursor, searchTerm]);

  // Merge admin users paginated results
  useEffect(() => {
    if (!adminUsersPage || searchTerm.trim()) return;

    const { page, continueCursor: nextCursor, isDone: nextIsDone } = adminUsersPage;

    setPaginatedAdminUsers((prev) => {
      if (!adminCursor) return page as UserDoc[];
      const existingIds = new Set(prev.map((u) => u._id));
      const merged = [...prev];
      page.forEach((u) => {
        if (!existingIds.has(u._id)) merged.push(u as UserDoc);
      });
      return merged;
    });
    setAdminContinueCursor(nextCursor ?? null);
    setAdminIsDone(Boolean(nextIsDone) || !nextCursor);
    setAdminLoadingMore(false);
  }, [adminUsersPage, adminCursor, searchTerm]);

  const canLoadMoreRegular =
    !searchTerm.trim() && !regularIsDone && Boolean(regularContinueCursor);
  const handleLoadMoreRegular = useCallback(() => {
    if (!canLoadMoreRegular || regularLoadingMore) return;
    setRegularLoadingMore(true);
    setRegularCursorScope("list");
    setRegularCursor(regularContinueCursor);
  }, [canLoadMoreRegular, regularContinueCursor, regularLoadingMore]);

  const canLoadMoreAdmin =
    !searchTerm.trim() && !adminIsDone && Boolean(adminContinueCursor);
  const handleLoadMoreAdmin = useCallback(() => {
    if (!canLoadMoreAdmin || adminLoadingMore) return;
    setAdminLoadingMore(true);
    setAdminCursorScope("list");
    setAdminCursor(adminContinueCursor);
  }, [canLoadMoreAdmin, adminContinueCursor, adminLoadingMore]);

  const regularIsLoading =
    searchTerm.trim()
      ? searchResults === undefined
      : regularUsersPage === undefined && paginatedRegularUsers.length === 0;
  const adminIsLoading =
    searchTerm.trim()
      ? searchResults === undefined
      : adminUsersPage === undefined && paginatedAdminUsers.length === 0;
  const editingOwnAccount = useMemo(
    () => (editingUser && currentUser ? editingUser._id === currentUser._id : false),
    [editingUser, currentUser],
  );
  const userName = userToDelete?.name ?? userToDelete?.email ?? "this user";
  const isCurrentUser = (user: UserDoc | null | undefined) =>
    Boolean(user && currentUser?._id && currentUser._id === user._id);

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

    const validation = editingUser
      ? userUpdateSchema.safeParse({
          name: formValues.name,
          email: formValues.email,
          phone: formValues.phone || undefined,
          isAdmin: formValues.isAdmin,
        })
      : userInputSchema.safeParse(formValues);

    if (!validation.success) {
      const issue = validation.error.errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    setIsSaving(true);

    try {
      if (editingUser) {
        const validated = validation.data;
        await updateUser({
          id: editingUser._id,
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          isAdmin: editingOwnAccount ? editingUser.isGod ?? false : validated.isAdmin,
        });
        toast.success("User updated successfully");
      } else {
        // TypeScript doesn't narrow the union type, so we assert it's UserInput
        const validated = validation.data as {
          name: string;
          email: string;
          phone?: string;
          password: string;
          isAdmin: boolean;
        };
        await createUser({
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          password: validated.password,
          isAdmin: validated.isAdmin,
        });
        toast.success("User created successfully");
      }

      setIsDialogOpen(false);
      setEditingUser(null);
      setFormValues(initialFormValues);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userToUpdatePassword) {
      return;
    }

    const validation = userPasswordUpdateSchema.safeParse(passwordFormValues);

    if (!validation.success) {
      const issue = validation.error.errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await updateUserPassword({
        id: userToUpdatePassword._id,
        password: validation.data.password,
      });
      toast.success("Password updated successfully");
      setIsPasswordDialogOpen(false);
      setUserToUpdatePassword(null);
      setPasswordFormValues({ password: "" });
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteUser({ id: userToDelete._id });
      toast.success("User deleted successfully");
      setUserToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRoleToggle = async (user: UserDoc) => {
    if (isCurrentUser(user)) {
      toast.error("You cannot change your own administrator status.");
      return;
    }

    const label = user.name ?? user.email ?? "User";

    setRoleUpdating((prev) => ({
      ...prev,
      [user._id]: true,
    }));

    try {
      await updateUserRole({
        id: user._id,
        isAdmin: !user.isGod,
      });
      toast.success(
        user.isGod
          ? `${label} is now a regular user`
          : `${label} is now an administrator`,
      );
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setRoleUpdating((prev) => {
        const next = { ...prev };
        delete next[user._id];
        return next;
      });
    }
  };

  const handleExportEmails = async () => {
    setIsExporting(true);
    try {
      const csvContent = await exportUserEmails();
      
      // Create a blob and download it
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `user-emails-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("User emails exported successfully");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-2">
            Manage system users and administrators
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleExportEmails}
            disabled={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting…" : "Export Emails"}
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingUser(null);
                setFormValues(initialFormValues);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="cta"
                onClick={() => {
                  setEditingUser(null);
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit" : "Create"} User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formValues.name}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formValues.email}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, email: event.target.value }))
                    }
                    required
                    maxLength={255}
                    disabled={!!editingUser}
                  />
                  {editingUser && (
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed after user creation.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formValues.phone}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  maxLength={20}
                />
              </div>
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formValues.password}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, password: event.target.value }))
                    }
                    required={!editingUser}
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters long.
                  </p>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Switch
                  id="isAdmin"
                  checked={formValues.isAdmin}
                  disabled={editingOwnAccount}
                  onCheckedChange={(checked) =>
                    setFormValues((prev) => ({ ...prev, isAdmin: checked }))
                  }
                />
                <Label htmlFor="isAdmin" className="cursor-pointer">
                  Administrator (Full Access)
                </Label>
              </div>
              {editingOwnAccount && (
                <p className="text-xs text-muted-foreground">
                  You cannot change your own administrator status.
                </p>
              )}
              <Button
                type="submit"
                variant="cta"
                className="w-full"
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : editingUser ? "Update" : "Create"} User
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            Users ({regularUsers.length})
          </TabsTrigger>
          <TabsTrigger value="admins">
            Administrators ({adminUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Users</h2>
            <p className="text-sm text-muted-foreground">
              Standard accounts with limited access
            </p>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularIsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        Loading users…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : regularUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        No users yet. Create your first user to get started.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  regularUsers.map((user) => {
                    const roleButtonLabel = roleUpdating[user._id]
                      ? "Updating…"
                      : user.isGod
                        ? "Make User"
                        : "Make Admin";

                    return (
                      <TableRow key={user._id}>
                        <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{user.phone ?? "—"}</TableCell>
                        <TableCell>
                          {user.emailVerificationTime ? (
                            <Badge variant="outline">Verified</Badge>
                          ) : (
                            <Badge variant="outline" className="opacity-50">
                              Unverified
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRoleToggle(user)}
                              disabled={roleUpdating[user._id] || isCurrentUser(user)}
                            >
                              {roleButtonLabel}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/users/${user._id}/info`)}
                              title="View user info"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingUser(user);
                                setIsDialogOpen(true);
                              }}
                              title="Edit user"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setUserToUpdatePassword(user);
                                setIsPasswordDialogOpen(true);
                              }}
                              title="Change password"
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                            {/* Delete button hidden for now */}
                            {/* <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setUserToDelete(user)}
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button> */}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {(canLoadMoreRegular || (regularLoadingMore && paginatedRegularUsers.length > 0)) && (
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMoreRegular}
                disabled={!canLoadMoreRegular || regularLoadingMore}
                className="min-w-[160px]"
              >
                {regularLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="admins" className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Administrators</h2>
            <p className="text-sm text-muted-foreground">
              Members with full access to the panel
            </p>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminIsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        Loading administrators…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : adminUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        No administrators yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  adminUsers.map((user) => {
                    const roleButtonLabel = roleUpdating[user._id]
                      ? "Updating…"
                      : user.isGod
                        ? "Make User"
                        : "Make Admin";

                    return (
                      <TableRow key={user._id}>
                        <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{user.phone ?? "—"}</TableCell>
                        <TableCell>
                          {user.emailVerificationTime ? (
                            <Badge variant="outline">Verified</Badge>
                          ) : (
                            <Badge variant="outline" className="opacity-50">
                              Unverified
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRoleToggle(user)}
                              disabled={roleUpdating[user._id] || isCurrentUser(user)}
                            >
                              {roleButtonLabel}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/users/${user._id}/info`)}
                              title="View user info"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingUser(user);
                                setIsDialogOpen(true);
                              }}
                              title="Edit user"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setUserToUpdatePassword(user);
                                setIsPasswordDialogOpen(true);
                              }}
                              title="Change password"
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                            {/* Delete button hidden for now */}
                            {/* <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setUserToDelete(user)}
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button> */}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {(canLoadMoreAdmin || (adminLoadingMore && paginatedAdminUsers.length > 0)) && (
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMoreAdmin}
                disabled={!canLoadMoreAdmin || adminLoadingMore}
                className="min-w-[160px]"
              >
                {adminLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Password Update Dialog */}
      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={(open) => {
          setIsPasswordDialogOpen(open);
          if (!open) {
            setUserToUpdatePassword(null);
            setPasswordFormValues({ password: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                value={passwordFormValues.password}
                onChange={(event) =>
                  setPasswordFormValues({ password: event.target.value })
                }
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters long.
              </p>
            </div>
            <Button
              type="submit"
              variant="cta"
              className="w-full"
              disabled={isUpdatingPassword}
            >
              {isUpdatingPassword ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={userToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">{userName}</span> from the system.
              You can&apos;t undo this action.
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

export default Users;

