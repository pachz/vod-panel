import { Archive, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ViewDeletedToggleProps {
  viewDeleted: boolean;
  onToggle: () => void;
  activeLabel?: string;
  deletedLabel?: string;
}

export const ViewDeletedToggle = ({
  viewDeleted,
  onToggle,
  activeLabel = "View Active",
  deletedLabel = "View Deleted",
}: ViewDeletedToggleProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            {viewDeleted ? (
              <Eye className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{viewDeleted ? activeLabel : deletedLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

