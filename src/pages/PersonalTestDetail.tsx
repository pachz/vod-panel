import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Eye,
  GitBranch,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { cn } from "@/lib/utils";
import {
  QuestionFormDialog,
  type QuestionFormValues,
} from "@/components/PersonalTests/QuestionFormDialog";
import { ResultFormDialog } from "@/components/PersonalTests/ResultFormDialog";
import { ResultCorrelationsDialog } from "@/components/PersonalTests/ResultCorrelationsDialog";
import { ResultPreviewDialog } from "@/components/PersonalTests/ResultPreviewDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { personalTestUpdateSchema } from "../../shared/validation/personalTest";
import {
  defaultAnalyticsEndDate,
  defaultAnalyticsStartDate,
} from "../../shared/validation/personalTestAnalytics";
import { PersonalTestAnalyticsPanel } from "@/components/PersonalTests/PersonalTestAnalyticsPanel";
import { ImageDropzone, type ImageUploadState } from "@/components/ImageDropzone";
import { TableFilters, type TableFilter } from "@/components/TableFilters";
import { isResultColor } from "@/components/PersonalTests/resultColor";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
};

function formatAttemptDuration(seconds: number | undefined) {
  if (seconds === undefined) {
    return "—";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) {
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatAttemptDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

type AttemptStatus = "in_progress" | "completed" | "abandoned" | "expired";

const attemptStatusLabel: Record<AttemptStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Abandoned",
  expired: "Expired",
};

const ATTEMPTS_PAGE_SIZE = 20;

type AttemptListItem = {
  _id: Id<"personalTestAttempts">;
  _creationTime: number;
  testId: Id<"personalTests">;
  userId: Id<"users">;
  userName?: string;
  userEmail?: string;
  status: AttemptStatus;
  startedAt: number;
  completedAt?: number;
  durationSeconds?: number;
  selectedAnswerCount: number;
  recommendedCourseCount: number;
  isPreview: boolean;
};

type QuestionRow = {
  question: {
    _id: Id<"personalTestQuestions">;
    title: string;
    title_ar: string;
    answerType: "single" | "multi";
    displayOrder: number;
  };
  answers: Array<{
    _id: Id<"personalTestAnswers">;
    text: string;
    text_ar: string;
    resultIds: Id<"personalTestResults">[];
  }>;
};

type ResultRow = {
  _id: Id<"personalTestResults">;
  title: string;
  title_ar: string;
  description?: string;
  description_ar?: string;
  cover_image_url?: string;
  color?: string;
  recommendedCourseIds: Id<"courses">[];
  ctaText?: string;
  ctaText_ar?: string;
  ctaUrl?: string;
  displayOrder: number;
};

type SortableQuestionRowProps = {
  item: QuestionRow;
  index: number;
  onEdit: (item: QuestionRow) => void;
  onDelete: (item: QuestionRow) => void;
  onCorrelate: (item: QuestionRow) => void;
};

const SortableQuestionRow = ({
  item,
  index,
  onEdit,
  onDelete,
  onCorrelate,
}: SortableQuestionRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.question._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 bg-muted/50")}
    >
      <TableCell className="w-10">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="w-12 text-center font-semibold text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell>
        <div>
          <span className="font-medium">{item.question.title}</span>
          <span className="block text-xs text-muted-foreground">{item.question.title_ar}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {item.question.answerType === "single" ? "Single choice" : "Multi choice"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCorrelate(item)}
                aria-label="Result correlations"
              >
                <GitBranch className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Result correlations</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => onDelete(item)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

const PersonalTestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const testId = id as Id<"personalTests">;

  const data = useQuery(api.personalTest.getPersonalTest, { testId });
  const courses = useQuery(api.plans.listCoursesForPicker);

  const updateTest = useMutation(api.personalTest.updatePersonalTest);
  const setEnabled = useMutation(api.personalTest.setPersonalTestEnabled);
  const publishTest = useMutation(api.personalTest.publishPersonalTest);
  const saveQuestion = useMutation(api.personalTest.savePersonalTestQuestion);
  const deleteQuestion = useMutation(api.personalTest.deletePersonalTestQuestion);
  const reorderQuestions = useMutation(api.personalTest.reorderPersonalTestQuestions);
  const generateImageUploadUrl = useMutation(api.personalTest.generatePersonalTestImageUploadUrl);
  const updatePersonalTestThumbnail = useMutation(api.personalTest.updatePersonalTestThumbnail);
  const updatePersonalTestCover = useMutation(api.personalTest.updatePersonalTestCover);
  const deleteResult = useMutation(api.personalTest.deletePersonalTestResult);

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab === "analytics" ||
      tab === "questions" ||
      tab === "results" ||
      tab === "attempts" ||
      tab === "info"
      ? tab
      : "info";
  });
  const [analyticsStartDate, setAnalyticsStartDate] = useState(() =>
    defaultAnalyticsStartDate(30),
  );
  const [analyticsEndDate, setAnalyticsEndDate] = useState(() =>
    defaultAnalyticsEndDate(),
  );
  const [attemptSearchInput, setAttemptSearchInput] = useState("");
  const [attemptSearch, setAttemptSearch] = useState<string | undefined>();
  const [attemptStatusFilter, setAttemptStatusFilter] = useState<
    AttemptStatus | undefined
  >();
  const attemptSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isLoadingMoreAttempts, setIsLoadingMoreAttempts] = useState(false);
  const [paginatedAttempts, setPaginatedAttempts] = useState<AttemptListItem[]>(
    [],
  );
  const [attemptCursor, setAttemptCursor] = useState<string | null>(null);
  const [attemptContinueCursor, setAttemptContinueCursor] = useState<
    string | null
  >(null);
  const [attemptsDone, setAttemptsDone] = useState(false);
  const [attemptCursorScope, setAttemptCursorScope] = useState<string | null>(
    null,
  );

  const attemptFilterKey = useMemo(
    () => `${attemptStatusFilter ?? ""}|${attemptSearch ?? ""}`,
    [attemptStatusFilter, attemptSearch],
  );

  const attemptsPage = useQuery(
    api.personalTestAttempts.listPersonalTestAttempts,
    activeTab === "attempts"
      ? {
          testId,
          search: attemptSearch,
          status: attemptStatusFilter,
          limit: ATTEMPTS_PAGE_SIZE,
          cursor:
            attemptCursor !== null && attemptCursorScope === attemptFilterKey
              ? attemptCursor
              : undefined,
        }
      : "skip",
  );

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [displayOrder, setDisplayOrder] = useState("50");
  const [description, setDescription] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [showAllResults, setShowAllResults] = useState(true);
  const [maxCourses, setMaxCourses] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [thumbnailUploadState, setThumbnailUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const tempThumbnailUrlRef = useRef<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverUploadState, setCoverUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const tempCoverUrlRef = useRef<string | null>(null);
  const [startButtonColor, setStartButtonColor] = useState("");
  const [startButtonText, setStartButtonText] = useState("");
  const [startButtonTextAr, setStartButtonTextAr] = useState("");

  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionRow | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<QuestionRow | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  const [orderedQuestions, setOrderedQuestions] = useState<QuestionRow[]>([]);

  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<ResultRow | null>(null);
  const [previewingResult, setPreviewingResult] = useState<ResultRow | null>(null);
  const [resultToDelete, setResultToDelete] = useState<ResultRow | null>(null);
  const [isDeletingResult, setIsDeletingResult] = useState(false);
  const [correlatingQuestion, setCorrelatingQuestion] = useState<QuestionRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!data) return;
    setName(data.test.name);
    setNameAr(data.test.name_ar);
    setDisplayOrder(String(data.test.displayOrder));
    setDescription(data.test.description ?? "");
    setDescriptionAr(data.test.description_ar ?? "");
    setShowAllResults(data.test.resultSettings.showAll);
    setMaxCourses(
      data.test.resultSettings.maxCourses !== undefined
        ? String(data.test.resultSettings.maxCourses)
        : "",
    );
    setIsEnabled(data.test.status === "published");
    setOrderedQuestions(data.questions);
    setThumbnailPreviewUrl(data.test.thumbnail_image_url ?? null);
    setCoverPreviewUrl(data.test.cover_image_url ?? null);
    setStartButtonColor(
      isResultColor(data.test.start_button_color) ? data.test.start_button_color : "",
    );
    setStartButtonText(data.test.start_button_text ?? "");
    setStartButtonTextAr(data.test.start_button_text_ar ?? "");
  }, [data]);

  const courseMap = useMemo(() => {
    const map = new Map<
      Id<"courses">,
      { name: string; name_ar: string; imageUrl?: string }
    >();
    for (const course of courses ?? []) {
      map.set(course._id, {
        name: course.name,
        name_ar: course.name_ar,
        imageUrl: course.thumbnail_image_url ?? course.banner_image_url,
      });
    }
    return map;
  }, [courses]);

  useEffect(() => {
    setAttemptCursor(null);
    setAttemptContinueCursor(null);
    setAttemptsDone(false);
    setPaginatedAttempts([]);
    setAttemptCursorScope(null);
  }, [attemptFilterKey]);

  useEffect(() => {
    if (!attemptsPage) return;

    setAttemptContinueCursor(attemptsPage.continueCursor);
    setAttemptsDone(attemptsPage.isDone);
    setAttemptCursorScope(attemptFilterKey);

    setPaginatedAttempts((prev) => {
      if (attemptCursor === null || attemptCursorScope !== attemptFilterKey) {
        return attemptsPage.page;
      }
      const existingIds = new Set(prev.map((attempt) => attempt._id));
      const newItems = attemptsPage.page.filter(
        (attempt) => !existingIds.has(attempt._id),
      );
      return [...prev, ...newItems];
    });
    setIsLoadingMoreAttempts(false);
  }, [attemptsPage, attemptCursor, attemptCursorScope, attemptFilterKey]);

  useEffect(() => {
    return () => {
      if (attemptSearchTimeoutRef.current) {
        clearTimeout(attemptSearchTimeoutRef.current);
      }
    };
  }, []);

  const handleAttemptSearchChange = useCallback((value: string) => {
    setAttemptSearchInput(value);
    if (attemptSearchTimeoutRef.current) {
      clearTimeout(attemptSearchTimeoutRef.current);
    }
    attemptSearchTimeoutRef.current = setTimeout(() => {
      const trimmed = value.trim();
      setAttemptSearch(trimmed.length > 0 ? trimmed : undefined);
    }, 300);
  }, []);

  const handleAttemptStatusFilterChange = useCallback(
    (value: string | undefined) => {
      setAttemptStatusFilter(
        value === "in_progress" ||
          value === "completed" ||
          value === "abandoned" ||
          value === "expired"
          ? value
          : undefined,
      );
    },
    [],
  );

  const handleClearAttemptFilters = useCallback(() => {
    setAttemptSearchInput("");
    setAttemptSearch(undefined);
    setAttemptStatusFilter(undefined);
  }, []);

  const handleLoadMoreAttempts = () => {
    if (attemptContinueCursor && !attemptsDone && !isLoadingMoreAttempts) {
      setIsLoadingMoreAttempts(true);
      setAttemptCursor(attemptContinueCursor);
    }
  };

  const attemptFilters = useMemo<TableFilter[]>(
    () => [
      {
        key: "status",
        label: "Status",
        value: attemptStatusFilter,
        placeholder: "All statuses",
        options: [
          { label: "In progress", value: "in_progress" },
          { label: "Completed", value: "completed" },
          { label: "Abandoned", value: "abandoned" },
          { label: "Expired", value: "expired" },
        ],
        onChange: handleAttemptStatusFilterChange,
      },
    ],
    [attemptStatusFilter, handleAttemptStatusFilterChange],
  );

  const questionFormInitial = useMemo<QuestionFormValues | undefined>(() => {
    if (!editingQuestion) return undefined;
    return {
      title: editingQuestion.question.title,
      titleAr: editingQuestion.question.title_ar,
      answerType: editingQuestion.question.answerType,
      answers: editingQuestion.answers.map((a) => ({
        answerId: a._id,
        text: a.text,
        textAr: a.text_ar,
      })),
    };
  }, [editingQuestion]);

  const resetTempThumbnailPreview = () => {
    if (tempThumbnailUrlRef.current) {
      URL.revokeObjectURL(tempThumbnailUrlRef.current);
      tempThumbnailUrlRef.current = null;
    }
  };

  const resetTempCoverPreview = () => {
    if (tempCoverUrlRef.current) {
      URL.revokeObjectURL(tempCoverUrlRef.current);
      tempCoverUrlRef.current = null;
    }
  };

  const uploadFileWithProgress = (
    uploadUrl: string,
    file: File,
    onProgress: (progress: number) => void,
  ) =>
    new Promise<{ storageId: string }>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.responseType = "json";
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        onProgress(0);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress(Math.min(1, event.loaded / event.total));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error while uploading the image."));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response =
                xhr.response && typeof xhr.response === "object"
                  ? xhr.response
                  : JSON.parse(xhr.responseText);

              if (response && typeof response.storageId === "string") {
                onProgress(1);
                resolve({ storageId: response.storageId });
                return;
              }

              reject(new Error("Upload completed but no storage ID was returned."));
            } catch (parseError) {
              reject(
                parseError instanceof Error
                  ? parseError
                  : new Error("Failed to parse upload response."),
              );
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}.`));
          }
        };

        xhr.send(file);
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error("Unexpected error while preparing the upload."),
        );
      }
    });

  const handleThumbnailSelect = async (file: File) => {
    if (!data) return;

    resetTempThumbnailPreview();
    const previewUrl = URL.createObjectURL(file);
    tempThumbnailUrlRef.current = previewUrl;
    setThumbnailPreviewUrl(previewUrl);
    setThumbnailUploadState({ status: "uploading", progress: 0 });

    try {
      const uploadUrl = await generateImageUploadUrl();
      const { storageId } = await uploadFileWithProgress(uploadUrl, file, (progress) => {
        setThumbnailUploadState({ status: "uploading", progress: progress * 0.8 });
      });

      setThumbnailUploadState({ status: "uploading", progress: 0.9 });

      const result = await updatePersonalTestThumbnail({
        testId,
        thumbnailStorageId: storageId as Id<"_storage">,
      });

      resetTempThumbnailPreview();
      setThumbnailPreviewUrl(result.thumbnailImageUrl);
      setThumbnailUploadState({ status: "success", progress: 1 });
      toast.success("Test thumbnail updated.");

      setTimeout(() => {
        setThumbnailUploadState({ status: "idle", progress: 0 });
      }, 1200);
    } catch (error) {
      console.error(error);
      resetTempThumbnailPreview();
      setThumbnailPreviewUrl(data.test.thumbnail_image_url ?? null);
      setThumbnailUploadState({
        status: "error",
        progress: 0,
        errorMessage: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error));
    }
  };

  const handleCoverSelect = async (file: File) => {
    if (!data) return;

    resetTempCoverPreview();
    const previewUrl = URL.createObjectURL(file);
    tempCoverUrlRef.current = previewUrl;
    setCoverPreviewUrl(previewUrl);
    setCoverUploadState({ status: "uploading", progress: 0 });

    try {
      const uploadUrl = await generateImageUploadUrl();
      const { storageId } = await uploadFileWithProgress(uploadUrl, file, (progress) => {
        setCoverUploadState({ status: "uploading", progress: progress * 0.8 });
      });

      setCoverUploadState({ status: "uploading", progress: 0.9 });

      const result = await updatePersonalTestCover({
        testId,
        coverStorageId: storageId as Id<"_storage">,
      });

      resetTempCoverPreview();
      setCoverPreviewUrl(result.coverImageUrl);
      setCoverUploadState({ status: "success", progress: 1 });
      toast.success("Cover image updated.");

      setTimeout(() => {
        setCoverUploadState({ status: "idle", progress: 0 });
      }, 1200);
    } catch (error) {
      console.error(error);
      resetTempCoverPreview();
      setCoverPreviewUrl(data.test.cover_image_url ?? null);
      setCoverUploadState({
        status: "error",
        progress: 0,
        errorMessage: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error));
    }
  };

  const handleCoverRemove = async () => {
    if (!data) return;

    setCoverUploadState({ status: "uploading", progress: 0.5 });
    try {
      await updatePersonalTestCover({ testId, clearCover: true });
      resetTempCoverPreview();
      setCoverPreviewUrl(null);
      setCoverUploadState({ status: "idle", progress: 0 });
      toast.success("Cover image removed.");
    } catch (error) {
      setCoverUploadState({
        status: "error",
        progress: 0,
        errorMessage: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error));
    }
  };

  const handleSaveInfo = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!data) return;

    const parsedMax = maxCourses.trim() ? Number.parseInt(maxCourses, 10) : undefined;
    const parsedDisplayOrder = Number.parseInt(displayOrder, 10);
    const result = personalTestUpdateSchema.safeParse({
      name,
      nameAr,
      displayOrder: Number.isFinite(parsedDisplayOrder) ? parsedDisplayOrder : NaN,
      description: description || undefined,
      descriptionAr: descriptionAr || undefined,
      resultSettings: {
        showAll: showAllResults,
        maxCourses: showAllResults ? undefined : parsedMax,
      },
      startButtonColor: startButtonColor || undefined,
      startButtonText: startButtonText || undefined,
      startButtonTextAr: startButtonTextAr || undefined,
    });

    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "Invalid input.");
      return;
    }

    const { test } = data;
    const savedEnabled = test.status === "published";
    const effectiveStatus =
      test.status === "draft" && test.publishedSnapshot !== undefined
        ? "published"
        : test.status;
    const canToggleAvailability =
      test.publishedSnapshot !== undefined && effectiveStatus !== "draft";

    const infoChanged =
      name !== test.name ||
      nameAr !== test.name_ar ||
      result.data.displayOrder !== test.displayOrder ||
      (description || "") !== (test.description ?? "") ||
      (descriptionAr || "") !== (test.description_ar ?? "") ||
      (startButtonColor || "") !== (test.start_button_color ?? "") ||
      (startButtonText || "") !== (test.start_button_text ?? "") ||
      (startButtonTextAr || "") !== (test.start_button_text_ar ?? "");

    const resultChanged =
      result.data.resultSettings.showAll !== test.resultSettings.showAll ||
      (result.data.resultSettings.showAll
        ? false
        : result.data.resultSettings.maxCourses !== test.resultSettings.maxCourses);

    const statusChanged = canToggleAvailability && isEnabled !== savedEnabled;

    if (!infoChanged && !resultChanged && !statusChanged) {
      toast.message("No changes to save.");
      return;
    }

    setIsSavingInfo(true);
    try {
      if (infoChanged || resultChanged) {
        await updateTest({
          testId,
          name: result.data.name,
          nameAr: result.data.nameAr,
          displayOrder: result.data.displayOrder,
          description: result.data.description,
          descriptionAr: result.data.descriptionAr,
          resultSettings: {
            showAll: result.data.resultSettings.showAll ?? showAllResults,
            maxCourses: result.data.resultSettings.maxCourses,
          },
          startButtonColor: result.data.startButtonColor,
          startButtonText: result.data.startButtonText,
          startButtonTextAr: result.data.startButtonTextAr,
        });
      }

      if (statusChanged) {
        await setEnabled({ testId, enabled: isEnabled });
      }

      toast.success("Test settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await publishTest({ testId });
      toast.success("Test published.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveQuestion = async (values: QuestionFormValues) => {
    setIsSavingQuestion(true);
    try {
      await saveQuestion({
        testId,
        questionId: editingQuestion?.question._id,
        title: values.title,
        titleAr: values.titleAr,
        answerType: values.answerType,
        answers: values.answers.map((a) => ({
          answerId: a.answerId,
          text: a.text,
          textAr: a.textAr,
        })),
      });
      toast.success(editingQuestion ? "Question updated." : "Question added.");
      setQuestionDialogOpen(false);
      setEditingQuestion(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save question.");
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!questionToDelete) return;
    setIsDeletingQuestion(true);
    try {
      await deleteQuestion({
        testId,
        questionId: questionToDelete.question._id,
      });
      toast.success("Question deleted.");
      setQuestionToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete question.");
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleDeleteResult = async () => {
    if (!resultToDelete) return;
    setIsDeletingResult(true);
    try {
      await deleteResult({
        testId,
        resultId: resultToDelete._id,
      });
      toast.success("Result deleted.");
      setResultToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete result.");
    } finally {
      setIsDeletingResult(false);
    }
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedQuestions.findIndex((q) => q.question._id === active.id);
      const newIndex = orderedQuestions.findIndex((q) => q.question._id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...orderedQuestions];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved!);
      setOrderedQuestions(reordered);

      try {
        await reorderQuestions({
          testId,
          questionIds: reordered.map((q) => q.question._id),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reorder.");
        setOrderedQuestions(data?.questions ?? []);
      }
    },
    [orderedQuestions, reorderQuestions, testId, data?.questions],
  );

  if (data === undefined) {
    return <p className="text-muted-foreground">Loading test…</p>;
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <p>Test not found.</p>
        <Button variant="outline" onClick={() => navigate("/personal-tests")}>
          Back to tests
        </Button>
      </div>
    );
  }

  const { test, canPublish, results } = data;
  const effectiveStatus =
    test.status === "draft" && test.publishedSnapshot !== undefined
      ? "published"
      : test.status;
  const isDraft = effectiveStatus === "draft";
  const isPublished = effectiveStatus === "published";
  const hasBeenPublished = test.publishedSnapshot !== undefined;
  const canToggleAvailability = hasBeenPublished && !isDraft;
  const showPublishButton =
    canPublish && (isDraft || test.hasUnpublishedChanges);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/personal-tests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Personal Tests
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{test.name}</h1>
            <Badge variant={isDraft ? "secondary" : isPublished ? "default" : "outline"}>
              {isDraft ? "Draft" : isPublished ? "Published" : "Disabled"}
            </Badge>
            {test.hasUnpublishedChanges && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Unpublished changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{test.name_ar}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/personal-tests/${testId}/preview`}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Link>
          </Button>
          {showPublishButton && (
            <Button variant="cta" onClick={handlePublish} disabled={isPublishing}>
              <Upload className="mr-2 h-4 w-4" />
              {isPublishing
                ? "Publishing…"
                : test.hasUnpublishedChanges
                  ? "Publish changes"
                  : "Publish"}
            </Button>
          )}
        </div>
      </div>
      {!canPublish && (isDraft || test.hasUnpublishedChanges) && (
        <p className="text-sm text-muted-foreground">
          Add questions with answers, at least one result, and answer–result
          correlations before publishing.
        </p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Test info</TabsTrigger>
          <TabsTrigger value="questions">
            Questions
            <Badge variant="secondary" className="ml-2">
              {test.questionCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="results">
            Results
            <Badge variant="secondary" className="ml-2">
              {results.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="attempts">Attempts</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
          <form onSubmit={handleSaveInfo} className="space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
            <h2 className="font-medium">Basic information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name-ar">Name (Arabic)</Label>
                <Input
                  id="name-ar"
                  value={nameAr}
                  dir="rtl"
                  onChange={(e) => setNameAr(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="display-order">Ordering</Label>
              <Input
                id="display-order"
                type="number"
                min={0}
                max={1000}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Lower numbers appear first on the take-test page.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description-ar">Description (Arabic, optional)</Label>
                <Textarea
                  id="description-ar"
                  value={descriptionAr}
                  dir="rtl"
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {canToggleAvailability && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="enabled">Status</Label>
                  <p className="text-sm text-muted-foreground">
                    {isEnabled
                      ? "Test will be enabled for users."
                      : "Test will be disabled for users."}
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={isEnabled}
                  onCheckedChange={setIsEnabled}
                />
              </div>
            )}

            {!canToggleAvailability && (
              <p className="text-sm text-muted-foreground">
                Publish the test to enable or disable it for users.
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
            <h2 className="font-medium">Card thumbnail</h2>
            <p className="text-sm text-muted-foreground">
              Shown on the test listing card. Landscape image recommended (16:9).
            </p>
            <ImageDropzone
              id="personal-test-thumbnail"
              label="Test thumbnail"
              helperText="Click to browse or drop an image file."
              aspectRatioClass="aspect-video"
              value={thumbnailPreviewUrl}
              onSelectFile={handleThumbnailSelect}
              uploadState={thumbnailUploadState}
              disabled={isSavingInfo}
            />
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
            <h2 className="font-medium">Cover page</h2>
            <p className="text-sm text-muted-foreground">
              Shown before the quiz starts. All fields are optional. Landscape image
              recommended (16:9).
            </p>
            <ImageDropzone
              id="personal-test-cover"
              label="Cover image (optional)"
              helperText="Click to browse or drop an image file."
              aspectRatioClass="aspect-video"
              value={coverPreviewUrl}
              onSelectFile={handleCoverSelect}
              uploadState={coverUploadState}
              disabled={isSavingInfo}
            />
            {coverPreviewUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCoverRemove}
                disabled={isSavingInfo || coverUploadState.status === "uploading"}
              >
                Remove cover
              </Button>
            )}

            <div className="space-y-2">
              <Label>Start button color (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={startButtonColor || "#E91E8C"}
                  onChange={(event) => setStartButtonColor(event.target.value)}
                  className="h-10 w-12 cursor-pointer p-1"
                  aria-label="Start button color"
                />
                <Input
                  value={startButtonColor}
                  onChange={(event) => setStartButtonColor(event.target.value)}
                  placeholder="#E91E8C"
                  className="font-mono"
                />
                {startButtonColor && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStartButtonColor("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Used on the start quiz button. Leave empty to use the default button.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-button-text">Start button text (optional)</Label>
                <Input
                  id="start-button-text"
                  value={startButtonText}
                  onChange={(event) => setStartButtonText(event.target.value)}
                  placeholder="Start Test"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-button-text-ar">
                  Start button text (Arabic, optional)
                </Label>
                <Input
                  id="start-button-text-ar"
                  value={startButtonTextAr}
                  dir="rtl"
                  onChange={(event) => setStartButtonTextAr(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
            <h2 className="font-medium">Result settings</h2>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="show-all">Show all recommended courses</Label>
                <p className="text-sm text-muted-foreground">
                  When off, limit how many courses appear in results.
                </p>
              </div>
              <Switch
                id="show-all"
                checked={showAllResults}
                onCheckedChange={setShowAllResults}
              />
            </div>
            {!showAllResults && (
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="max-courses">Limit results to</Label>
                <Input
                  id="max-courses"
                  type="number"
                  min={1}
                  max={100}
                  value={maxCourses}
                  onChange={(e) => setMaxCourses(e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
            )}
          </div>

          <div className="flex max-w-2xl justify-end">
            <Button type="submit" variant="cta" disabled={isSavingInfo}>
              {isSavingInfo ? "Saving…" : "Save changes"}
            </Button>
          </div>
          </form>
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Questions</h2>
              <Button
                variant="cta"
                onClick={() => {
                  setEditingQuestion(null);
                  setQuestionDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add question
              </Button>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Question title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-36">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedQuestions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No questions yet. Add your first question.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <SortableContext
                        items={orderedQuestions.map((q) => q.question._id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {orderedQuestions.map((item, index) => (
                          <SortableQuestionRow
                            key={item.question._id}
                            item={item}
                            index={index}
                            onEdit={(row) => {
                              setEditingQuestion(row);
                              setQuestionDialogOpen(true);
                            }}
                            onDelete={setQuestionToDelete}
                            onCorrelate={setCorrelatingQuestion}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Results</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outcome pages for this test. Map answers to them from the
                  questions table. Test takers will see these in a later update.
                </p>
              </div>
              <Button
                variant="cta"
                onClick={() => {
                  setEditingResult(null);
                  setResultDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add result
              </Button>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Cover</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Call to action</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No results yet. Add your first result.
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map((result) => (
                      <TableRow key={result._id}>
                        <TableCell>
                          <div className="h-10 w-16 overflow-hidden rounded-md bg-muted">
                            {result.cover_image_url ? (
                              <img
                                src={result.cover_image_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                None
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            {result.color ? (
                              <span
                                className="mt-1 h-3 w-3 shrink-0 rounded-full border"
                                style={{ backgroundColor: result.color }}
                                title={result.color}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <span
                                className="font-medium"
                                style={
                                  result.color ? { color: result.color } : undefined
                                }
                              >
                                {result.title}
                              </span>
                              <span
                                className="mt-0.5 block text-xs text-muted-foreground"
                                dir="rtl"
                              >
                                {result.title_ar}
                              </span>
                              {result.recommendedCourseIds.length > 0 ? (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {result.recommendedCourseIds.length} recommended
                                  {result.recommendedCourseIds.length === 1
                                    ? " course"
                                    : " courses"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {result.ctaText && result.ctaUrl ? (
                            <div>
                              <span
                                className="text-sm font-medium"
                                style={
                                  result.color ? { color: result.color } : undefined
                                }
                              >
                                {result.ctaText}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {result.ctaUrl}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPreviewingResult(result)}
                                  aria-label="Preview result"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Preview result</TooltipContent>
                            </Tooltip>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingResult(result);
                                setResultDialogOpen(true);
                              }}
                              aria-label="Edit result"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => setResultToDelete(result)}
                              aria-label="Delete result"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="attempts" className="mt-6 space-y-4">
          <div className="rounded-lg border bg-card px-4 py-3">
            <TableFilters
              filters={attemptFilters}
              onClearAll={handleClearAttemptFilters}
              searchValue={attemptSearchInput}
              onSearchChange={handleAttemptSearchChange}
              searchPlaceholder="Search by user name or email…"
            />
          </div>

          <div className="rounded-xl border bg-card">
            {attemptsPage === undefined && paginatedAttempts.length === 0 ? (
              <p className="p-6 text-muted-foreground">Loading attempts…</p>
            ) : paginatedAttempts.length === 0 ? (
              <p className="p-6 text-muted-foreground">
                {attemptSearch || attemptStatusFilter
                  ? "No attempts match your filters."
                  : "No attempts recorded yet. Preview the test or wait for users to take it."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Ended</TableHead>
                    <TableHead>Answers</TableHead>
                    <TableHead>Courses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAttempts.map((attempt) => (
                    <TableRow key={attempt._id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {attempt.userName ?? "Unknown user"}
                          </span>
                          {attempt.userEmail && (
                            <span className="block text-xs text-muted-foreground">
                              {attempt.userEmail}
                            </span>
                          )}
                          {attempt.isPreview && (
                            <Badge variant="outline" className="mt-1">
                              Preview
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            attempt.status === "completed"
                              ? "default"
                              : attempt.status === "in_progress"
                                ? "secondary"
                                : attempt.status === "expired"
                                  ? "outline"
                                  : "outline"
                          }
                          className={
                            attempt.status === "expired"
                              ? "text-amber-700 border-amber-300"
                              : undefined
                          }
                        >
                          {attemptStatusLabel[attempt.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span>{formatAttemptDuration(attempt.durationSeconds)}</span>
                        {attempt.durationSeconds !== undefined && (
                          <span className="block text-xs text-muted-foreground">
                            {attempt.durationSeconds}s
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatAttemptDate(attempt.startedAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {attempt.completedAt
                          ? formatAttemptDate(attempt.completedAt)
                          : "—"}
                      </TableCell>
                      <TableCell>{attempt.selectedAnswerCount}</TableCell>
                      <TableCell>{attempt.recommendedCourseCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {!attemptsDone && paginatedAttempts.length > 0 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMoreAttempts}
                disabled={isLoadingMoreAttempts}
              >
                {isLoadingMoreAttempts ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <PersonalTestAnalyticsPanel
            testId={testId}
            startDate={analyticsStartDate}
            endDate={analyticsEndDate}
            onStartDateChange={setAnalyticsStartDate}
            onEndDateChange={setAnalyticsEndDate}
          />
        </TabsContent>
      </Tabs>

      <QuestionFormDialog
        open={questionDialogOpen}
        onOpenChange={(open) => {
          setQuestionDialogOpen(open);
          if (!open) setEditingQuestion(null);
        }}
        mode={editingQuestion ? "edit" : "create"}
        initial={questionFormInitial}
        onSave={handleSaveQuestion}
        isSaving={isSavingQuestion}
      />

      <AlertDialog open={!!questionToDelete} onOpenChange={() => setQuestionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{questionToDelete?.question.title}&rdquo; and its answers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingQuestion}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteQuestion}
              disabled={isDeletingQuestion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingQuestion ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResultFormDialog
        open={resultDialogOpen}
        onOpenChange={(open) => {
          setResultDialogOpen(open);
          if (!open) setEditingResult(null);
        }}
        testId={testId}
        initial={editingResult ?? undefined}
        mode={editingResult ? "edit" : "create"}
      />

      <ResultPreviewDialog
        open={previewingResult !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewingResult(null);
        }}
        result={previewingResult}
        courses={
          previewingResult
            ? previewingResult.recommendedCourseIds
                .map((courseId) => {
                  const course = courseMap.get(courseId);
                  return course ? { _id: courseId, ...course } : null;
                })
                .filter(Boolean) as Array<{
                _id: Id<"courses">;
                name: string;
                name_ar: string;
                imageUrl?: string;
              }>
            : []
        }
      />

      {correlatingQuestion && (
        <ResultCorrelationsDialog
          open
          onOpenChange={(open) => {
            if (!open) setCorrelatingQuestion(null);
          }}
          testId={testId}
          questionId={correlatingQuestion.question._id}
          questionNumber={
            orderedQuestions.findIndex(
              (item) => item.question._id === correlatingQuestion.question._id,
            ) + 1
          }
          questionTitle={correlatingQuestion.question.title}
          answers={correlatingQuestion.answers.map((answer) => ({
            _id: answer._id,
            text: answer.text,
            resultIds: answer.resultIds,
          }))}
          results={results.map((result) => ({
            _id: result._id,
            title: result.title,
            color: result.color,
          }))}
        />
      )}

      <AlertDialog open={!!resultToDelete} onOpenChange={() => setResultToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete result?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{resultToDelete?.title}&rdquo; and any answer
              correlations that point to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingResult}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteResult}
              disabled={isDeletingResult}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingResult ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PersonalTestDetail;
