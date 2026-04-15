import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserWithMultipleActiveSubscriptions } from "./usePayments";

type AdminMultipleActiveSubscriptionsProps = {
  usersWithMultipleActiveSubscriptions: UserWithMultipleActiveSubscriptions[] | undefined;
  onOpenUser: (userId: string) => void;
};

function formatSubscriptionWindow(startMs: number, endMs: number) {
  return `${format(new Date(startMs), "PPP")} -> ${format(new Date(endMs), "PPP")}`;
}

export function AdminMultipleActiveSubscriptions({
  usersWithMultipleActiveSubscriptions,
  onOpenUser,
}: AdminMultipleActiveSubscriptionsProps) {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Duplicate Active Subscriptions
          <Badge variant="outline" className="text-xs">
            Admin only
          </Badge>
        </CardTitle>
        <CardDescription>
          Users currently holding more than one active subscription. Review and fix duplicates or reimburse as needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Active Count</TableHead>
                <TableHead>Active Subscriptions</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersWithMultipleActiveSubscriptions === undefined ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                    Loading duplicate subscriptions...
                  </TableCell>
                </TableRow>
              ) : usersWithMultipleActiveSubscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                    No users currently have multiple active subscriptions.
                  </TableCell>
                </TableRow>
              ) : (
                usersWithMultipleActiveSubscriptions.map((entry) => (
                  <TableRow key={entry.userId}>
                    <TableCell className="font-medium">{entry.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{entry.activeSubscriptionCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {entry.subscriptions.map((subscription) => (
                          <div key={subscription.subscriptionId} className="text-xs text-muted-foreground">
                            <span className="font-mono text-foreground">{subscription.subscriptionId}</span>
                            {" - "}
                            <span className="capitalize">{subscription.status}</span>
                            {" - "}
                            {formatSubscriptionWindow(
                              subscription.currentPeriodStart,
                              subscription.currentPeriodEnd,
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenUser(entry.userId)}
                      >
                        Open user
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
