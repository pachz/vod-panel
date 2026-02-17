import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, CreditCard, Calendar, BookOpen, Gift, History, Loader2 } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// Subscription period dates from backend are Unix milliseconds (Stripe and admin-grant)
const periodDate = (ms: number) => new Date(ms);

const DURATION_OPTIONS = [
  { value: 30, label: "1 month" },
  { value: 90, label: "3 months" },
  { value: 180, label: "6 months" },
  { value: 365, label: "1 year" },
] as const;

const UserInfo = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [giveSubOpen, setGiveSubOpen] = useState(false);
  const [durationDays, setDurationDays] = useState<number>(365);
  const [isGranting, setIsGranting] = useState(false);
  const [isRefreshingSub, setIsRefreshingSub] = useState(false);

  const userInfo = useQuery(
    api.user.getUserInfo,
    id ? { id: id as Id<"users"> } : "skip"
  );
  const adminGrantSubscription = useMutation(api.user.adminGrantSubscription);
  const adminSyncUserSubscriptionFromStripe = useAction(
    api.payment.adminSyncUserSubscriptionFromStripe,
  );

  if (userInfo === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading user information...</p>
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/users")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Users
        </Button>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">User not found</p>
        </div>
      </div>
    );
  }

  const { user, subscription, subscriptionHistory, checkoutHistory, paymentInfo, courses } = userInfo;
  const nowMs = Date.now();
  const isPeriodActive = (endMs: number) => endMs >= nowMs;
  const hasActiveSubscription =
    subscription &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    isPeriodActive(subscription.currentPeriodEnd);
  const canGrantSubscription = !user.isGod && !hasActiveSubscription;

  const handleRefreshSubscription = async () => {
    if (!id) return;
    setIsRefreshingSub(true);
    try {
      const result = await adminSyncUserSubscriptionFromStripe({
        userId: id as Id<"users">,
      });
      if (!result.success) {
        toast.error(result.message || "Failed to sync subscription");
      } else {
        toast.success(result.message || "Subscription synced successfully");
      }
    } catch (error: unknown) {
      const msg =
        error &&
        typeof error === "object" &&
        "data" in error &&
        typeof (error as { data?: { message?: string } }).data?.message ===
          "string"
          ? (error as { data: { message: string } }).data.message
          : error instanceof Error && error.message
            ? error.message
            : "Failed to sync subscription";
      toast.error(msg);
    } finally {
      setIsRefreshingSub(false);
    }
  };

  const handleGrantSubscription = async () => {
    if (!id) return;
    setIsGranting(true);
    try {
      await adminGrantSubscription({ userId: id as Id<"users">, durationDays });
      toast.success("Subscription granted successfully");
      setGiveSubOpen(false);
    } catch (error: unknown) {
      const msg = error && typeof error === "object" && "data" in error && typeof (error as { data?: { message?: string } }).data?.message === "string"
        ? (error as { data: { message: string } }).data.message
        : "Failed to grant subscription";
      toast.error(msg);
    } finally {
      setIsGranting(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  const getSubscriptionStatusBadge = (status: string, periodEndMs?: number) => {
    const isExpired =
      (status === "active" || status === "trialing") &&
      periodEndMs != null &&
      periodEndMs < nowMs;
    const displayStatus = isExpired ? "expired" : status;
    const statusMap: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      trialing: { variant: "default", label: "Trialing" },
      expired: { variant: "secondary", label: "Expired" },
      canceled: { variant: "secondary", label: "Canceled" },
      past_due: { variant: "destructive", label: "Past Due" },
      unpaid: { variant: "destructive", label: "Unpaid" },
      incomplete: { variant: "outline", label: "Incomplete" },
    };

    const config = statusMap[displayStatus] || { variant: "outline" as const, label: displayStatus };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/users")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Information</h1>
            <p className="text-muted-foreground mt-2">View user details, payments, and courses</p>
          </div>
        </div>
      </div>

      {/* User Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                Email
              </div>
              <p className="font-medium">{user.email || "—"}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                Name
              </div>
              <p className="font-medium">{user.name || "—"}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                Phone
              </div>
              <p className="font-medium">{user.phone || "—"}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Member Since
              </div>
              <p className="font-medium">
                {user.createdAt ? format(new Date(user.createdAt), "PPP") : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Role
              </div>
              <div>
                {user.isGod ? (
                  <Badge variant="default">Administrator</Badge>
                ) : (
                  <Badge variant="secondary">User</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Total Paid</div>
              <p className="text-2xl font-bold">
                {formatCurrency(paymentInfo.totalPaid, paymentInfo.currency)}
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Completed Payments</div>
              <p className="text-2xl font-bold">{paymentInfo.completedPayments}</p>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Payment Interval</div>
              <p className="text-lg font-medium">
                {paymentInfo.paymentInterval
                  ? paymentInfo.paymentInterval.charAt(0).toUpperCase() +
                    paymentInfo.paymentInterval.slice(1)
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Information */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Current Subscription
          </CardTitle>
          <div className="flex items-center gap-2">
            {subscription &&
              !subscription.isAdminGranted &&
              user.stripeCustomerId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshSubscription}
                  disabled={isRefreshingSub}
                >
                  {isRefreshingSub && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Refresh subscription
                </Button>
              )}
            {canGrantSubscription && (
              <Button
                variant="cta"
                size="sm"
                onClick={() => setGiveSubOpen(true)}
              >
                <Gift className="mr-2 h-4 w-4" />
                Give subscription
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="flex items-center gap-2">
                    {getSubscriptionStatusBadge(subscription.status, subscription.currentPeriodEnd)}
                    {subscription?.isAdminGranted && (
                      <Badge variant="secondary">Admin granted</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Subscription ID</div>
                  <p className="font-mono text-sm break-all">{subscription.subscriptionId}</p>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Current Period Start</div>
                  <p className="font-medium">
                    {format(periodDate(subscription.currentPeriodStart), "PPP")}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Current Period End</div>
                  <p className="font-medium">
                    {format(periodDate(subscription.currentPeriodEnd), "PPP")}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Cancel at Period End</div>
                  <div>
                    {subscription.cancelAtPeriodEnd ? (
                      <Badge variant="destructive">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </div>
                </div>
                {subscription.canceledAt && (
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Canceled At</div>
                    <p className="font-medium">
                      {format(periodDate(subscription.canceledAt), "PPP")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No active subscription</p>
          )}
        </CardContent>
      </Card>

      {/* Subscription History */}
      {subscriptionHistory && subscriptionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Subscription history
            </CardTitle>
            <CardDescription>All plans and status changes for this user</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Period start</TableHead>
                    <TableHead>Period end</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptionHistory.map((sub) => (
                    <TableRow key={sub.subscriptionId}>
                      <TableCell>{getSubscriptionStatusBadge(sub.status, sub.currentPeriodEnd)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(periodDate(sub.currentPeriodStart), "PPP")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(periodDate(sub.currentPeriodEnd), "PPP")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(sub.createdAt), "PPP")}
                      </TableCell>
                      <TableCell>
                        {sub.isAdminGranted ? (
                          <Badge variant="secondary">Admin granted</Badge>
                        ) : (
                          <span className="text-muted-foreground">Stripe</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checkout / payment history */}
      {checkoutHistory && checkoutHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment / checkout history
            </CardTitle>
            <CardDescription>Checkout sessions and payment events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkoutHistory.map((session) => (
                    <TableRow key={session.sessionId}>
                      <TableCell>
                        <Badge variant={session.status === "complete" ? "default" : "outline"}>
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(session.createdAt), "PPP p")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.completedAt
                          ? format(new Date(session.completedAt), "PPP p")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Give subscription dialog */}
      <Dialog open={giveSubOpen} onOpenChange={setGiveSubOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Give subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Grant an active subscription to this user. They will have full access until the period end.
            </p>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select
                value={String(durationDays)}
                onValueChange={(v) => setDurationDays(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGiveSubOpen(false)} disabled={isGranting}>
              Cancel
            </Button>
            <Button variant="cta" onClick={handleGrantSubscription} disabled={isGranting}>
              {isGranting ? "Granting…" : "Grant subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Courses List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Courses ({courses.total})
          </CardTitle>
          <CardDescription>
            Courses the user has started (completed at least one lesson)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {courses.list.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course Name</TableHead>
                    <TableHead>Arabic Name</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Total Lessons</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.list.map((course) => (
                    <TableRow key={course._id}>
                      <TableCell className="font-medium">{course.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {course.name_ar}
                      </TableCell>
                      <TableCell>
                        {course.completedLessons !== undefined && course.totalLessons !== undefined ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {course.completedLessons} / {course.totalLessons}
                            </span>
                            {course.totalLessons > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {Math.round((course.completedLessons / course.totalLessons) * 100)}%
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{course.totalLessons ?? course.lesson_count ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(course.createdAt), "PPP")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground">User has not started any courses yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserInfo;

