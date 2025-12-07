import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Lock, Eye } from "lucide-react";
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

const Users = () => {
  const navigate = useNavigate();
  const users = useQuery(api.user.listUsers);
  const currentUser = useQuery(api.user.getCurrentUser);
  const createUser = useAction(api.user.createUser);
  const updateUser = useMutation(api.user.updateUser);
  const updateUserRole = useMutation(api.user.updateUserRole);
  const updateUserPassword = useAction(api.user.updateUserPassword);
  const deleteUser = useMutation(api.user.deleteUser);

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

  const userList = useMemo<UserDoc[]>(() => users ?? [], [users]);
  const isLoading = users === undefined;
  const adminUsers = useMemo(
    () => userList.filter((user) => user.isGod),
    [userList],
  );
  const regularUsers = useMemo(
    () => userList.filter((user) => !user.isGod),
    [userList],
  );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-2">
            Manage system users and administrators
          </p>
        </div>
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

      {[
        {
          title: "Administrators",
          description: "Members with full access to the panel",
          data: adminUsers,
          emptyState: "No administrators yet.",
        },
        {
          title: "Users",
          description: "Standard accounts with limited access",
          data: regularUsers,
          emptyState: "No users yet. Create your first user to get started.",
        },
      ].map((section) => (
        <div className="space-y-4" key={section.title}>
          <div>
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        Loading users…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : section.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                        {section.emptyState}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  section.data.map((user) => {
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
                          {user.isGod ? (
                            <Badge variant="default">Admin</Badge>
                          ) : (
                            <Badge variant="secondary">User</Badge>
                          )}
                        </TableCell>
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
        </div>
      ))}

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

