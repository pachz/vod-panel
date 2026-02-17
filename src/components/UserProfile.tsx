import { useCallback, useMemo, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import MD5 from "crypto-js/md5";
import { 
  LogOut, 
  Key, 
  Package, 
  GitCommit,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Get version and commit hash
// For version, we'll read from package.json at build time
// For commit hash, Vite only exposes variables prefixed with VITE_
const version = import.meta.env.VITE_APP_VERSION || "0.0.0";

const commitHash = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA
  ? String(import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA).slice(0, 7)
  : "dev";

export function UserProfile() {
  const currentUser = useQuery(api.user.getCurrentUser);
  const { signOut } = useAuthActions();
  const changeMyPassword = useAction(api.user.changeMyPassword);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const gravatarUrl = useMemo(() => {
    if (!currentUser?.email) {
      return null;
    }
    // Normalize email: lowercase and trim whitespace
    const normalizedEmail = currentUser.email.toLowerCase().trim();
    // Generate MD5 hash (crypto-js MD5 already returns lowercase hex)
    const emailHash = MD5(normalizedEmail).toString();
    // Construct Gravatar URL with parameters:
    // s=128: size in pixels
    // d=mp: default image type (mystery person)
    // r=pg: rating filter (g, pg, r, x) - pg is safe for most contexts
    return `https://www.gravatar.com/avatar/${emailHash}?s=128&d=mp&r=pg`;
  }, [currentUser?.email]);

  const userInitial = useMemo(() => {
    if (currentUser?.name) {
      return currentUser.name.charAt(0).toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email.charAt(0).toUpperCase();
    }
    return "?";
  }, [currentUser]);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, signOut]);

  const handleChangePassword = useCallback(async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeMyPassword({ newPassword });
      toast.success("Password changed successfully");
      setIsChangePasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Failed to change password. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsChangingPassword(false);
    }
  }, [newPassword, confirmPassword, changeMyPassword]);

  if (!currentUser) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-10 w-10 rounded-full border border-border/60"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={gravatarUrl || undefined} alt={currentUser.name || currentUser.email || "User"} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64"
          align="end"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          forceMount
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {currentUser.name || "User"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {currentUser.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsChangePasswordOpen(true)}
            className="cursor-pointer"
          >
            <Key className="mr-2 h-4 w-4" />
            <span>Change Password</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              <span>Version {version}</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <GitCommit className="h-3.5 w-3.5" />
              <span>Build {commitHash}</span>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsChangePasswordOpen(false);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={isChangingPassword}
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Changing…" : "Change Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

